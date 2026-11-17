using System.Data.Common;
using System.Text.Json;
using AdcSmartCms.Application.Customers;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Customers CRM: tổng hợp khách hàng từ cms_ecommerce_orders.
///  - Khách có tài khoản: customer_id != NULL -> JOIN cms_users (full_name, email).
///  - Khách vãng lai: customer_id IS NULL -> đọc JSON shipping_info (fullName/full_name/name, phone, email, address).
/// Mỗi khách được định danh bằng CustomerKey: "user:{id}" hoặc "guest:{phone|email|name}".
/// </summary>
public sealed class CustomerRepository : ICustomerRepository
{
    // Lấy toàn bộ đơn hàng của site kèm thông tin user (nếu có). Tổng hợp ở tầng C# để
    // tránh phụ thuộc vào hàm JSON của SQL Server và giữ logic định danh khách tập trung 1 chỗ.
    private const string SelectOrdersSql = """
        SELECT o.id AS Id, o.order_code AS OrderCode, o.customer_id AS CustomerId,
               o.order_status AS OrderStatus, o.payment_status AS PaymentStatus,
               o.payment_method AS PaymentMethod, o.shipping_info AS ShippingInfo,
               o.total_amount AS TotalAmount, o.coupon_code AS CouponCode, o.created_at AS CreatedAt,
               u.full_name AS UserFullName, u.email AS UserEmail
        FROM dbo.cms_ecommerce_orders o
        LEFT JOIN dbo.cms_users u ON u.id = o.customer_id
        WHERE o.site_id = @SiteId
        ORDER BY o.created_at DESC;
        """;

    private readonly IDbConnectionFactory _factory;

    public CustomerRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<CustomerListItemDto>> GetCustomersAsync(Guid siteId, string? keyword, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<OrderRow>(new CommandDefinition(
            SelectOrdersSql, new { SiteId = siteId }, cancellationToken: ct));

        var customers = Aggregate(rows);

        // Lọc theo keyword (tên/SĐT/email) - không phân biệt hoa thường.
        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var kw = keyword.Trim().ToLowerInvariant();
            customers = customers
                .Where(c =>
                    c.FullName.ToLowerInvariant().Contains(kw) ||
                    (c.Phone?.ToLowerInvariant().Contains(kw) ?? false) ||
                    (c.Email?.ToLowerInvariant().Contains(kw) ?? false))
                .ToList();
        }

        return customers;
    }

    public async Task<CustomerDetailResult?> GetCustomerByIdAsync(Guid siteId, string customerKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(customerKey)) return null;

        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<OrderRow>(new CommandDefinition(
            SelectOrdersSql, new { SiteId = siteId }, cancellationToken: ct));

        var key = customerKey.Trim();
        var matched = rows.Where(r => BuildKey(r) == key).ToList();
        if (matched.Count == 0) return null;

        var customer = Aggregate(matched).First();

        var orders = matched
            .Select(r => new CustomerOrderDto
            {
                Id = r.Id,
                OrderCode = r.OrderCode,
                OrderStatus = r.OrderStatus,
                PaymentStatus = r.PaymentStatus,
                PaymentMethod = r.PaymentMethod,
                TotalAmount = r.TotalAmount,
                CouponCode = r.CouponCode,
                CreatedAt = r.CreatedAt
            })
            .ToList();

        return new CustomerDetailResult(customer, orders);
    }

    // ---------- Helpers ----------

    /// <summary>Gom nhóm đơn hàng theo CustomerKey và tính thống kê mua hàng.</summary>
    private static List<CustomerListItemDto> Aggregate(IEnumerable<OrderRow> rows)
    {
        var groups = new Dictionary<string, List<OrderRow>>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in rows)
        {
            var key = BuildKey(r);
            if (!groups.TryGetValue(key, out var list))
            {
                list = new List<OrderRow>();
                groups[key] = list;
            }
            list.Add(r);
        }

        var result = new List<CustomerListItemDto>(groups.Count);
        foreach (var (key, list) in groups)
        {
            var first = list[0]; // đã ORDER BY created_at DESC
            var contact = ExtractContact(first);

            result.Add(new CustomerListItemDto
            {
                CustomerKey = key,
                IsRegistered = first.CustomerId is not null,
                UserId = first.CustomerId,
                FullName = contact.FullName,
                Phone = contact.Phone,
                Email = contact.Email,
                Address = contact.Address,
                OrderCount = list.Count,
                TotalSpent = list.Sum(o => o.TotalAmount),
                LastOrderAt = list.Max(o => o.CreatedAt),
                FirstOrderAt = list.Min(o => o.CreatedAt)
            });
        }

        // Sắp xếp theo lần mua gần nhất giảm dần.
        return result
            .OrderByDescending(c => c.LastOrderAt ?? DateTimeOffset.MinValue)
            .ToList();
    }

    /// <summary>Tạo CustomerKey ổn định cho 1 đơn hàng.</summary>
    private static string BuildKey(OrderRow r)
    {
        if (r.CustomerId is { } uid)
            return $"user:{uid}";

        var contact = ExtractContact(r);
        var idPart = !string.IsNullOrWhiteSpace(contact.Phone)
            ? contact.Phone
            : !string.IsNullOrWhiteSpace(contact.Email)
                ? contact.Email
                : contact.FullName;

        return $"guest:{idPart.Trim().ToLowerInvariant()}";
    }

    /// <summary>Trích thông tin liên hệ: ưu tiên user (nếu có), sau đó shipping_info JSON.</summary>
    private static ContactInfo ExtractContact(OrderRow r)
    {
        string? fullName = null;
        string? phone = null;
        string? email = null;
        string? address = null;

        if (!string.IsNullOrWhiteSpace(r.ShippingInfo))
        {
            try
            {
                using var doc = JsonDocument.Parse(r.ShippingInfo);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    var root = doc.RootElement;
                    fullName = GetString(root, "fullName", "full_name", "name", "customerName");
                    phone = GetString(root, "phone", "phoneNumber", "phone_number", "tel");
                    email = GetString(root, "email", "emailAddress");
                    address = GetString(root, "address", "shippingAddress", "shipping_address");
                }
            }
            catch (JsonException)
            {
                // shipping_info không phải JSON hợp lệ -> bỏ qua.
            }
        }

        // Khách có tài khoản: ưu tiên tên/email từ cms_users.
        if (!string.IsNullOrWhiteSpace(r.UserFullName)) fullName = r.UserFullName;
        if (!string.IsNullOrWhiteSpace(r.UserEmail)) email = r.UserEmail;

        return new ContactInfo(
            string.IsNullOrWhiteSpace(fullName) ? "Khách vãng lai" : fullName.Trim(),
            phone?.Trim(),
            email?.Trim(),
            address?.Trim());
    }

    private static string? GetString(JsonElement obj, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (obj.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String)
            {
                var s = v.GetString();
                if (!string.IsNullOrWhiteSpace(s)) return s;
            }
        }
        return null;
    }

    private sealed record ContactInfo(string FullName, string? Phone, string? Email, string? Address);

    /// <summary>Dòng đọc từ cms_ecommerce_orders + cms_users.</summary>
    private sealed class OrderRow
    {
        public Guid Id { get; set; }
        public string OrderCode { get; set; } = string.Empty;
        public Guid? CustomerId { get; set; }
        public string OrderStatus { get; set; } = string.Empty;
        public string PaymentStatus { get; set; } = string.Empty;
        public string PaymentMethod { get; set; } = string.Empty;
        public string ShippingInfo { get; set; } = "{}";
        public decimal TotalAmount { get; set; }
        public string? CouponCode { get; set; }
        public DateTimeOffset CreatedAt { get; set; }
        public string? UserFullName { get; set; }
        public string? UserEmail { get; set; }
    }
}
