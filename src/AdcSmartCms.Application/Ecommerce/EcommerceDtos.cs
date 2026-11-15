using System.Text.Json;

namespace AdcSmartCms.Application.Ecommerce;

// ---------- Milestone 6: Pluggable E-Commerce ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_ecommerce_variants: site_id, entry_id, sku_code VARCHAR(100), barcode, price DECIMAL(18,2),
//      sale_price DECIMAL(18,2), cost_price, stock_quantity INT, reserved_quantity INT, track_inventory BIT,
//      variant_options NVARCHAR(MAX) JSON OBJECT, image_url, weight_gram, is_default BIT, is_active BIT
//      UNIQUE (site_id, sku_code)
//  cms_ecommerce_promotions: site_id, coupon_code VARCHAR(50), title, discount_type VARCHAR(20)
//      ('percentage'|'fixed_amount'|'free_shipping'), discount_value, max_discount_amount, min_order_amount,
//      usage_limit, used_count, start_at, end_at, is_active  UNIQUE (site_id, coupon_code)
//  cms_ecommerce_orders: site_id, order_code VARCHAR(50), customer_id, order_status, payment_status,
//      payment_method, shipping_info JSON OBJECT, subtotal_amount, discount_amount, shipping_fee, tax_amount,
//      total_amount, coupon_code, customer_note  UNIQUE (site_id, order_code)
//  cms_ecommerce_order_items: order_id, entry_id, variant_id, product_title NVARCHAR(500), sku_code,
//      variant_label, thumbnail_url, quantity INT (>0), unit_price, total_price (computed)

// ---------- Variants ----------

/// <summary>Một biến thể sản phẩm (bảng cms_ecommerce_variants).</summary>
public sealed class VariantDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public Guid EntryId { get; set; }
    public string SkuCode { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public decimal Price { get; set; }
    public decimal SalePrice { get; set; }
    public decimal? CostPrice { get; set; }
    public int StockQuantity { get; set; }
    public int ReservedQuantity { get; set; }
    public bool TrackInventory { get; set; }
    public string VariantOptions { get; set; } = "{}";   // JSON string (raw)
    public string? ImageUrl { get; set; }
    public int WeightGram { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; }
}

/// <summary>Body của POST /api/ecommerce/variants.</summary>
public sealed record CreateVariantRequest(
    Guid SiteId,
    Guid EntryId,
    string SkuCode,
    decimal Price,
    decimal SalePrice = 0,
    decimal? CostPrice = null,
    int StockQuantity = 0,
    bool TrackInventory = true,
    JsonElement? VariantOptions = null,
    string? Barcode = null,
    string? ImageUrl = null,
    int WeightGram = 0,
    bool IsDefault = false,
    bool IsActive = true);

/// <summary>
/// Body của PUT /api/ecommerce/variants/{variantId}.
/// null = giữ nguyên giá trị cũ.
/// </summary>
public sealed record UpdateVariantRequest(
    decimal? Price,
    decimal? SalePrice,
    int? StockQuantity,
    JsonElement? VariantOptions);

// ---------- Promotions ----------

/// <summary>
/// Body của PUT /api/ecommerce/promotions/{promoId}.
/// null = giữ nguyên giá trị cũ.
/// </summary>
public sealed record UpdatePromotionRequest(
    string? Title,
    decimal? DiscountValue,
    bool? IsActive);

/// <summary>Body của POST /api/ecommerce/promotions.</summary>
public sealed record CreatePromotionRequest(
    Guid SiteId,
    string CouponCode,
    string Title,
    string DiscountType,
    decimal DiscountValue,
    DateTimeOffset StartAt,
    DateTimeOffset? EndAt = null,
    decimal? MaxDiscountAmount = null,
    decimal MinOrderAmount = 0,
    int? UsageLimit = null,
    bool IsActive = true);

/// <summary>Kết quả tạo promotion.</summary>
public sealed record PromotionResult(
    Guid Id,
    Guid SiteId,
    string CouponCode,
    string Title,
    string DiscountType,
    decimal DiscountValue,
    decimal MinOrderAmount,
    DateTimeOffset StartAt,
    DateTimeOffset? EndAt,
    bool IsActive);

/// <summary>Body của POST /api/ecommerce/promotions/validate.</summary>
public sealed record ValidatePromotionRequest(Guid SiteId, string CouponCode, decimal OrderAmount);

/// <summary>Kết quả kiểm tra mã giảm giá.</summary>
public sealed record ValidatePromotionResult(
    bool IsValid,
    string CouponCode,
    decimal DiscountAmount,
    decimal FinalAmount,
    string? Reason);

// ---------- Orders ----------

/// <summary>Một dòng hàng trong body tạo đơn.</summary>
public sealed record OrderItemRequest(Guid VariantId, int Quantity);

/// <summary>Body của POST /api/ecommerce/orders.</summary>
public sealed record CreateOrderRequest(
    Guid SiteId,
    Guid? CustomerId,
    JsonElement? ShippingInfo,
    IReadOnlyList<OrderItemRequest> Items,
    string? CouponCode = null,
    string? PaymentMethod = "cod",
    decimal ShippingFee = 0,
    decimal TaxAmount = 0,
    string? CustomerNote = null);

/// <summary>Một dòng chi tiết đơn hàng trả về.</summary>
public sealed record OrderItemResult(
    Guid VariantId,
    Guid EntryId,
    string SkuCode,
    string ProductTitle,
    int Quantity,
    decimal UnitPrice,
    decimal TotalPrice);

/// <summary>Kết quả tạo đơn hàng.</summary>
public sealed record CreateOrderResult(
    Guid OrderId,
    string OrderCode,
    string OrderStatus,
    string PaymentStatus,
    decimal SubtotalAmount,
    decimal DiscountAmount,
    decimal ShippingFee,
    decimal TaxAmount,
    decimal TotalAmount,
    string? CouponCode,
    IReadOnlyList<OrderItemResult> Items);

/// <summary>
/// Body của PUT /api/ecommerce/orders/{orderId}/status.
/// null = giữ nguyên giá trị cũ.
/// </summary>
public sealed record UpdateOrderStatusRequest(
    string? OrderStatus,
    string? PaymentStatus);

/// <summary>Kết quả cập nhật trạng thái đơn hàng.</summary>
public sealed record UpdateOrderStatusResult(
    Guid OrderId,
    string OrderStatus,
    string PaymentStatus);

/// <summary>Lỗi nghiệp vụ khi tạo đơn (đủ hàng, mã giảm giá, ...).</summary>
public sealed class EcommerceException : Exception
{
    public EcommerceException(string message, int statusCode = 400) : base(message) => StatusCode = statusCode;
    public int StatusCode { get; }
}

// ---------- Danh sách (GET) ----------

/// <summary>Một dòng trong GET /api/ecommerce/promotions.</summary>
public sealed class PromotionListItemDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public string CouponCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string DiscountType { get; set; } = string.Empty;
    public decimal DiscountValue { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public decimal MinOrderAmount { get; set; }
    public int? UsageLimit { get; set; }
    public int UsedCount { get; set; }
    public DateTimeOffset StartAt { get; set; }
    public DateTimeOffset? EndAt { get; set; }
    public bool IsActive { get; set; }
}

/// <summary>Một dòng trong GET /api/ecommerce/orders.</summary>
public sealed class OrderListItemDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public string OrderCode { get; set; } = string.Empty;
    public Guid? CustomerId { get; set; }
    public string OrderStatus { get; set; } = string.Empty;
    public string PaymentStatus { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;
    public string ShippingInfo { get; set; } = "{}";   // JSON string (raw)
    public decimal SubtotalAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal ShippingFee { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string? CouponCode { get; set; }
    public string? CustomerNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Một dòng chi tiết trong GET /api/ecommerce/orders/{orderId}.</summary>
public sealed class OrderItemDetailDto
{
    public long Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid EntryId { get; set; }
    public Guid VariantId { get; set; }
    public string ProductTitle { get; set; } = string.Empty;
    public string SkuCode { get; set; } = string.Empty;
    public string? VariantLabel { get; set; }
    public string? ThumbnailUrl { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TotalPrice { get; set; }
}

/// <summary>Kết quả GET /api/ecommerce/orders/{orderId}: đơn hàng + danh sách dòng hàng.</summary>
public sealed record OrderDetailResult(OrderListItemDto Order, IReadOnlyList<OrderItemDetailDto> Items);

public interface IEcommerceRepository
{
    /// <summary>Tạo biến thể; trả null nếu entry không tồn tại hoặc SKU đã tồn tại trong site.</summary>
    Task<VariantDto?> CreateVariantAsync(CreateVariantRequest request, CancellationToken ct);

    /// <summary>Danh sách biến thể của 1 entry (sắp theo is_default DESC, sku_code).</summary>
    Task<IReadOnlyList<VariantDto>> GetVariantsByEntryAsync(Guid entryId, CancellationToken ct);

    /// <summary>Cập nhật variant (price, sale_price, stock_quantity, variant_options). Trả false nếu không tồn tại.</summary>
    Task<bool> UpdateVariantAsync(Guid variantId, UpdateVariantRequest request, CancellationToken ct);

    /// <summary>Xóa variant. Trả false nếu không tồn tại.</summary>
    Task<bool> DeleteVariantAsync(Guid variantId, CancellationToken ct);

    /// <summary>Tạo mã giảm giá; trả null nếu coupon_code đã tồn tại trong site.</summary>
    Task<PromotionResult?> CreatePromotionAsync(CreatePromotionRequest request, CancellationToken ct);

    /// <summary>Cập nhật mã giảm giá (title, discount_value, is_active). Trả false nếu không tồn tại.</summary>
    Task<bool> UpdatePromotionAsync(Guid promoId, UpdatePromotionRequest request, CancellationToken ct);

    /// <summary>Xóa mã giảm giá. Trả false nếu không tồn tại.</summary>
    Task<bool> DeletePromotionAsync(Guid promoId, CancellationToken ct);

    /// <summary>Kiểm tra mã giảm giá và tính số tiền được giảm cho order_amount.</summary>
    Task<ValidatePromotionResult> ValidatePromotionAsync(ValidatePromotionRequest request, CancellationToken ct);

    /// <summary>
    /// Tạo đơn hàng trong 1 transaction ACID: tính tiền, áp mã giảm giá, trừ tồn kho
    /// (stock_quantity giảm, reserved_quantity tăng), insert order + order_items.
    /// Ném EcommerceException khi không đủ hàng / mã không hợp lệ / variant không tồn tại.
    /// </summary>
    Task<CreateOrderResult> CreateOrderAsync(CreateOrderRequest request, CancellationToken ct);

    /// <summary>
    /// Cập nhật order_status / payment_status của đơn hàng. null = giữ nguyên.
    /// Trả null nếu đơn không tồn tại.
    /// </summary>
    Task<UpdateOrderStatusResult?> UpdateOrderStatusAsync(Guid orderId, UpdateOrderStatusRequest request, CancellationToken ct);

    /// <summary>Xóa đơn hàng (cascade xóa order_items). Trả false nếu không tồn tại.</summary>
    Task<bool> DeleteOrderAsync(Guid orderId, CancellationToken ct);

    /// <summary>Danh sách mã giảm giá của site (mới nhất trước).</summary>
    Task<IReadOnlyList<PromotionListItemDto>> GetPromotionsAsync(Guid siteId, CancellationToken ct);

    /// <summary>Danh sách đơn hàng của site (mới nhất trước), lọc theo order_status nếu có.</summary>
    Task<IReadOnlyList<OrderListItemDto>> GetOrdersAsync(Guid siteId, string? orderStatus, CancellationToken ct);

    /// <summary>Chi tiết 1 đơn hàng kèm order_items. Trả null nếu không tồn tại.</summary>
    Task<OrderDetailResult?> GetOrderByIdAsync(Guid orderId, CancellationToken ct);
}
