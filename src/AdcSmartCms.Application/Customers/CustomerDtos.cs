namespace AdcSmartCms.Application.Customers;

// ---------- Customers CRM ----------
// Khách hàng được tổng hợp từ 2 nguồn trong bảng cms_ecommerce_orders:
//  - customer_id (GUID) != NULL  -> khách có tài khoản (JOIN cms_users).
//  - customer_id IS NULL         -> khách vãng lai, thông tin nằm trong JSON shipping_info
//                                   (fullName/full_name/name, phone, email, address).
// Mỗi "khách hàng" được định danh bằng CustomerKey:
//  - "user:{userId}"  cho khách có tài khoản.
//  - "guest:{phone|email|name}" cho khách vãng lai (chuẩn hóa lowercase).

/// <summary>Một dòng trong GET /api/customers.</summary>
public sealed class CustomerListItemDto
{
    /// <summary>Khóa định danh khách (dùng cho GET /api/customers/{id}).</summary>
    public string CustomerKey { get; set; } = string.Empty;

    /// <summary>true = khách có tài khoản (customer_id != null), false = khách vãng lai.</summary>
    public bool IsRegistered { get; set; }

    /// <summary>Id user nếu là khách có tài khoản.</summary>
    public Guid? UserId { get; set; }

    public string FullName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }

    public int OrderCount { get; set; }
    public decimal TotalSpent { get; set; }
    public DateTimeOffset? LastOrderAt { get; set; }
    public DateTimeOffset? FirstOrderAt { get; set; }
}

/// <summary>Một đơn hàng trong lịch sử mua của khách (GET /api/customers/{id}).</summary>
public sealed class CustomerOrderDto
{
    public Guid Id { get; set; }
    public string OrderCode { get; set; } = string.Empty;
    public string OrderStatus { get; set; } = string.Empty;
    public string PaymentStatus { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public string? CouponCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Kết quả GET /api/customers/{id}: thông tin khách + lịch sử đơn hàng.</summary>
public sealed record CustomerDetailResult(CustomerListItemDto Customer, IReadOnlyList<CustomerOrderDto> Orders);

public interface ICustomerRepository
{
    /// <summary>
    /// Danh sách khách hàng của site (tổng hợp từ đơn hàng), lọc theo keyword (tên/SĐT/email).
    /// Sắp xếp theo lần mua gần nhất giảm dần.
    /// </summary>
    Task<IReadOnlyList<CustomerListItemDto>> GetCustomersAsync(Guid siteId, string? keyword, CancellationToken ct);

    /// <summary>Chi tiết 1 khách + lịch sử đơn hàng. Trả null nếu không tìm thấy.</summary>
    Task<CustomerDetailResult?> GetCustomerByIdAsync(Guid siteId, string customerKey, CancellationToken ct);
}
