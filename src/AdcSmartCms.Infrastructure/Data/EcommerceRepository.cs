using System.Data;
using System.Data.Common;
using System.Text.Json;
using AdcSmartCms.Application.Ecommerce;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Milestone 6: Dapper repository cho Pluggable E-Commerce.
///  cms_ecommerce_variants / cms_ecommerce_promotions / cms_ecommerce_orders / cms_ecommerce_order_items
/// Tạo đơn hàng dùng transaction ACID: trừ tồn kho (stock_quantity--, reserved_quantity++) có điều kiện
/// (WHERE stock_quantity >= @Qty) để chống oversell khi nhiều request đồng thời.
/// </summary>
public sealed class EcommerceRepository : IEcommerceRepository
{
    // ---------- Variants ----------

    private const string EntryExistsSql = "SELECT COUNT(1) FROM dbo.cms_entries WHERE id = @EntryId AND site_id = @SiteId;";

    private const string SkuExistsSql = "SELECT COUNT(1) FROM dbo.cms_ecommerce_variants WHERE site_id = @SiteId AND sku_code = @SkuCode;";

    // OUTPUT INSERTED.id để ExecuteScalarAsync<Guid> lấy được ID của variant vừa tạo (không bao giờ null).
    private const string InsertVariantSql = """
        INSERT INTO dbo.cms_ecommerce_variants
            (site_id, entry_id, sku_code, barcode, price, sale_price, cost_price, stock_quantity,
             reserved_quantity, track_inventory, variant_options, image_url, weight_gram, is_default, is_active)
        OUTPUT INSERTED.id
        VALUES (@SiteId, @EntryId, @SkuCode, @Barcode, @Price, @SalePrice, @CostPrice, @StockQuantity,
                0, @TrackInventory, @VariantOptions, @ImageUrl, @WeightGram, @IsDefault, @IsActive);
        """;

    private const string SelectVariantByIdSql = """
        SELECT id AS Id, site_id AS SiteId, entry_id AS EntryId, sku_code AS SkuCode, barcode AS Barcode,
               price AS Price, sale_price AS SalePrice, cost_price AS CostPrice,
               stock_quantity AS StockQuantity, reserved_quantity AS ReservedQuantity,
               track_inventory AS TrackInventory, variant_options AS VariantOptions,
               image_url AS ImageUrl, weight_gram AS WeightGram, is_default AS IsDefault, is_active AS IsActive
        FROM dbo.cms_ecommerce_variants
        WHERE id = @VariantId;
        """;

    private const string UpdateVariantSql = """
        UPDATE dbo.cms_ecommerce_variants
        SET price           = COALESCE(@Price, price),
            sale_price      = COALESCE(@SalePrice, sale_price),
            stock_quantity  = COALESCE(@StockQuantity, stock_quantity),
            variant_options = COALESCE(@VariantOptions, variant_options)
        WHERE id = @VariantId;
        """;

    private const string DeleteVariantSql = "DELETE FROM dbo.cms_ecommerce_variants WHERE id = @VariantId;";

    private const string SelectVariantsSql = """
        SELECT id AS Id, site_id AS SiteId, entry_id AS EntryId, sku_code AS SkuCode, barcode AS Barcode,
               price AS Price, sale_price AS SalePrice, cost_price AS CostPrice,
               stock_quantity AS StockQuantity, reserved_quantity AS ReservedQuantity,
               track_inventory AS TrackInventory, variant_options AS VariantOptions,
               image_url AS ImageUrl, weight_gram AS WeightGram, is_default AS IsDefault, is_active AS IsActive
        FROM dbo.cms_ecommerce_variants
        WHERE entry_id = @EntryId
        ORDER BY is_default DESC, sku_code;
        """;

    // ---------- Promotions ----------

    private const string CouponExistsSql = "SELECT COUNT(1) FROM dbo.cms_ecommerce_promotions WHERE site_id = @SiteId AND coupon_code = @CouponCode;";

    private const string InsertPromotionSql = """
        INSERT INTO dbo.cms_ecommerce_promotions
            (site_id, coupon_code, title, discount_type, discount_value, max_discount_amount,
             min_order_amount, usage_limit, start_at, end_at, is_active)
        OUTPUT INSERTED.id, INSERTED.site_id, INSERTED.coupon_code, INSERTED.title, INSERTED.discount_type,
               INSERTED.discount_value, INSERTED.min_order_amount, INSERTED.start_at, INSERTED.end_at, INSERTED.is_active
        VALUES (@SiteId, @CouponCode, @Title, @DiscountType, @DiscountValue, @MaxDiscountAmount,
                @MinOrderAmount, @UsageLimit, @StartAt, @EndAt, @IsActive);
        """;

    private const string UpdatePromotionSql = """
        UPDATE dbo.cms_ecommerce_promotions
        SET title          = COALESCE(@Title, title),
            discount_value = COALESCE(@DiscountValue, discount_value),
            is_active      = COALESCE(@IsActive, is_active)
        WHERE id = @PromoId;
        """;

    private const string DeletePromotionSql = "DELETE FROM dbo.cms_ecommerce_promotions WHERE id = @PromoId;";

    private const string SelectPromotionSql = """
        SELECT id AS Id, site_id AS SiteId, coupon_code AS CouponCode, title AS Title,
               discount_type AS DiscountType, discount_value AS DiscountValue,
               max_discount_amount AS MaxDiscountAmount, min_order_amount AS MinOrderAmount,
               usage_limit AS UsageLimit, used_count AS UsedCount,
               start_at AS StartAt, end_at AS EndAt, is_active AS IsActive
        FROM dbo.cms_ecommerce_promotions
        WHERE site_id = @SiteId AND coupon_code = @CouponCode;
        """;

    // ---------- Orders ----------

    private const string OrderCodeExistsSql = "SELECT COUNT(1) FROM dbo.cms_ecommerce_orders WHERE site_id = @SiteId AND order_code = @OrderCode;";

    private const string SelectVariantForUpdateSql = """
        SELECT id AS Id, entry_id AS EntryId, sku_code AS SkuCode, price AS Price, sale_price AS SalePrice,
               stock_quantity AS StockQuantity, track_inventory AS TrackInventory,
               is_active AS IsActive, variant_options AS VariantOptions
        FROM dbo.cms_ecommerce_variants WITH (UPDLOCK, ROWLOCK)
        WHERE id = @VariantId AND site_id = @SiteId;
        """;

    private const string DecreaseStockSql = """
        UPDATE dbo.cms_ecommerce_variants
        SET stock_quantity = stock_quantity - @Qty,
            reserved_quantity = reserved_quantity + @Qty
        WHERE id = @VariantId AND stock_quantity >= @Qty;
        """;

    private const string SelectEntryTitleSql = """
        SELECT TOP 1 l.title
        FROM dbo.cms_entry_locales l
        WHERE l.entry_id = @EntryId
        ORDER BY CASE WHEN l.locale = 'vi' THEN 0 ELSE 1 END, l.updated_at DESC;
        """;

    private const string InsertOrderSql = """
        INSERT INTO dbo.cms_ecommerce_orders
            (site_id, order_code, customer_id, order_status, payment_status, payment_method, shipping_info,
             subtotal_amount, discount_amount, shipping_fee, tax_amount, total_amount, coupon_code, customer_note)
        OUTPUT INSERTED.id
        VALUES (@SiteId, @OrderCode, @CustomerId, 'pending', 'unpaid', @PaymentMethod, @ShippingInfo,
                @SubtotalAmount, @DiscountAmount, @ShippingFee, @TaxAmount, @TotalAmount, @CouponCode, @CustomerNote);
        """;

    private const string InsertOrderItemSql = """
        INSERT INTO dbo.cms_ecommerce_order_items
            (order_id, entry_id, variant_id, product_title, sku_code, variant_label, thumbnail_url, quantity, unit_price)
        VALUES (@OrderId, @EntryId, @VariantId, @ProductTitle, @SkuCode, @VariantLabel, @ThumbnailUrl, @Quantity, @UnitPrice);
        """;

    private const string IncreaseCouponUsageSql = """
        UPDATE dbo.cms_ecommerce_promotions
        SET used_count = used_count + 1
        WHERE site_id = @SiteId AND coupon_code = @CouponCode;
        """;

    private const string UpdateOrderStatusSql = """
        UPDATE dbo.cms_ecommerce_orders
        SET order_status   = COALESCE(@OrderStatus, order_status),
            payment_status = COALESCE(@PaymentStatus, payment_status),
            updated_at     = SYSDATETIMEOFFSET()
        OUTPUT INSERTED.id, INSERTED.order_status, INSERTED.payment_status
        WHERE id = @OrderId;
        """;

    private const string DeleteOrderSql = "DELETE FROM dbo.cms_ecommerce_orders WHERE id = @OrderId;";

    private readonly IDbConnectionFactory _factory;

    public EcommerceRepository(IDbConnectionFactory factory) => _factory = factory;

    // ---------- Variants ----------

    public async Task<VariantDto?> CreateVariantAsync(CreateVariantRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var entryExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            EntryExistsSql, new { request.EntryId, request.SiteId }, cancellationToken: ct));
        if (entryExists == 0) return null;

        var skuExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            SkuExistsSql, new { request.SiteId, SkuCode = Ansi(request.SkuCode, 100) }, cancellationToken: ct));
        if (skuExists > 0) return null;

        // Lấy ID vừa tạo qua OUTPUT INSERTED.id (ExecuteScalarAsync<Guid>).
        var variantId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertVariantSql, new
        {
            request.SiteId,
            request.EntryId,
            SkuCode = Ansi(request.SkuCode, 100),
            Barcode = Ansi(request.Barcode, 100),
            request.Price,
            request.SalePrice,
            request.CostPrice,
            request.StockQuantity,
            request.TrackInventory,
            VariantOptions = ToJsonObject(request.VariantOptions),
            ImageUrl = Ansi(request.ImageUrl, 500),
            request.WeightGram,
            request.IsDefault,
            request.IsActive
        }, cancellationToken: ct));

        // Đọc lại bản ghi đầy đủ để trả về DTO (đảm bảo Id không null).
        return await conn.QuerySingleAsync<VariantDto>(new CommandDefinition(
            SelectVariantByIdSql, new { VariantId = variantId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<VariantDto>> GetVariantsByEntryAsync(Guid entryId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<VariantDto>(new CommandDefinition(
            SelectVariantsSql, new { EntryId = entryId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<bool> UpdateVariantAsync(Guid variantId, UpdateVariantRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // variant_options: null => giữ nguyên; có giá trị => phải là JSON object.
        string? optionsJson = null;
        if (request.VariantOptions is { } vo && vo.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
        {
            if (vo.ValueKind != JsonValueKind.Object)
                throw new EcommerceException("variantOptions phải là JSON object.");
            optionsJson = vo.GetRawText();
        }

        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateVariantSql, new
        {
            VariantId = variantId,
            request.Price,
            request.SalePrice,
            request.StockQuantity,
            VariantOptions = optionsJson
        }, cancellationToken: ct));

        return affected > 0;
    }

    public async Task<bool> DeleteVariantAsync(Guid variantId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(
            DeleteVariantSql, new { VariantId = variantId }, cancellationToken: ct));
        return affected > 0;
    }

    // ---------- Promotions ----------

    public async Task<PromotionResult?> CreatePromotionAsync(CreatePromotionRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            CouponExistsSql, new { request.SiteId, CouponCode = Ansi(request.CouponCode, 50) }, cancellationToken: ct));
        if (exists > 0) return null;

        return await conn.QuerySingleAsync<PromotionResult>(new CommandDefinition(InsertPromotionSql, new
        {
            request.SiteId,
            CouponCode = Ansi(request.CouponCode, 50),
            Title = request.Title,                       // NVARCHAR(250)
            DiscountType = Ansi(request.DiscountType, 20),
            request.DiscountValue,
            request.MaxDiscountAmount,
            request.MinOrderAmount,
            request.UsageLimit,
            request.StartAt,
            request.EndAt,
            request.IsActive
        }, cancellationToken: ct));
    }

    public async Task<bool> UpdatePromotionAsync(Guid promoId, UpdatePromotionRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdatePromotionSql, new
        {
            PromoId = promoId,
            Title = request.Title,          // NVARCHAR(250) hoặc NULL
            request.DiscountValue,
            request.IsActive
        }, cancellationToken: ct));

        return affected > 0;
    }

    public async Task<bool> DeletePromotionAsync(Guid promoId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(
            DeletePromotionSql, new { PromoId = promoId }, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<ValidatePromotionResult> ValidatePromotionAsync(ValidatePromotionRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var promo = await conn.QuerySingleOrDefaultAsync<PromotionRow>(new CommandDefinition(
            SelectPromotionSql, new { request.SiteId, CouponCode = Ansi(request.CouponCode, 50) }, cancellationToken: ct));

        return EvaluatePromotion(promo, request.CouponCode, request.OrderAmount);
    }

    // ---------- Orders (ACID) ----------

    public async Task<CreateOrderResult> CreateOrderAsync(CreateOrderRequest request, CancellationToken ct)
    {
        if (request.Items is null || request.Items.Count == 0)
            throw new EcommerceException("Đơn hàng phải có ít nhất 1 sản phẩm.");
        if (request.Items.Any(i => i.Quantity <= 0))
            throw new EcommerceException("quantity phải > 0.");

        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        using var tx = conn.BeginTransaction(IsolationLevel.ReadCommitted);
        try
        {
            // 1) Khóa & đọc từng variant, kiểm tra tồn kho.
            var lines = new List<(Guid VariantId, Guid EntryId, string SkuCode, string Title, string? VariantLabel, string? Thumb, int Qty, decimal UnitPrice)>();
            foreach (var item in request.Items)
            {
                var v = await conn.QuerySingleOrDefaultAsync<VariantRow>(new CommandDefinition(
                    SelectVariantForUpdateSql, new { item.VariantId, request.SiteId }, tx, cancellationToken: ct));

                if (v is null)
                    throw new EcommerceException($"Không tìm thấy variant '{item.VariantId}' trong site.", 404);
                if (!v.IsActive)
                    throw new EcommerceException($"Variant '{v.SkuCode}' đang ngừng bán.");
                if (v.TrackInventory && v.StockQuantity < item.Quantity)
                    throw new EcommerceException($"Không đủ tồn kho cho SKU '{v.SkuCode}' (còn {v.StockQuantity}, cần {item.Quantity}).", 409);

                var title = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
                    SelectEntryTitleSql, new { v.EntryId }, tx, cancellationToken: ct)) ?? v.SkuCode;

                var unitPrice = v.SalePrice > 0 ? v.SalePrice : v.Price;
                lines.Add((v.Id, v.EntryId, v.SkuCode, title, v.VariantOptions, null, item.Quantity, unitPrice));
            }

            // 2) Tính tiền.
            var subtotal = lines.Sum(l => l.UnitPrice * l.Qty);

            // 3) Áp mã giảm giá (nếu có).
            decimal discount = 0;
            string? appliedCoupon = null;
            if (!string.IsNullOrWhiteSpace(request.CouponCode))
            {
                var promo = await conn.QuerySingleOrDefaultAsync<PromotionRow>(new CommandDefinition(
                    SelectPromotionSql, new { request.SiteId, CouponCode = Ansi(request.CouponCode, 50) }, tx, cancellationToken: ct));

                var check = EvaluatePromotion(promo, request.CouponCode, subtotal);
                if (!check.IsValid)
                    throw new EcommerceException($"Mã giảm giá không hợp lệ: {check.Reason}");

                discount = check.DiscountAmount;
                appliedCoupon = promo!.CouponCode;
            }

            var total = subtotal - discount + request.ShippingFee + request.TaxAmount;
            if (total < 0) total = 0;

            // 4) Trừ tồn kho có điều kiện (chống oversell).
            foreach (var l in lines)
            {
                var affected = await conn.ExecuteAsync(new CommandDefinition(
                    DecreaseStockSql, new { VariantId = l.VariantId, Qty = l.Qty }, tx, cancellationToken: ct));
                if (affected == 0)
                    throw new EcommerceException($"Không đủ tồn kho cho SKU '{l.SkuCode}' (đã bị thay đổi đồng thời).", 409);
            }

            // 5) Insert order + order_items.
            var orderCode = await GenerateOrderCodeAsync(conn, tx, request.SiteId, ct);

            // Anonymous object: Dapper tự map null -> DBNull.Value (không dùng DbString/DynamicParameters cho cột nullable).
            var orderId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertOrderSql, new
            {
                request.SiteId,
                OrderCode = Ansi(orderCode, 50),
                request.CustomerId,
                PaymentMethod = Ansi(string.IsNullOrWhiteSpace(request.PaymentMethod) ? "cod" : request.PaymentMethod, 50),
                ShippingInfo = ToJsonObject(request.ShippingInfo),
                SubtotalAmount = subtotal,
                DiscountAmount = discount,
                request.ShippingFee,
                request.TaxAmount,
                TotalAmount = total,
                CouponCode = appliedCoupon,          // string? -> Dapper tự truyền DBNull khi null
                CustomerNote = request.CustomerNote  // string? -> Dapper tự truyền DBNull khi null
            }, tx, cancellationToken: ct));

            var itemResults = new List<OrderItemResult>();
            foreach (var l in lines)
            {
                await conn.ExecuteAsync(new CommandDefinition(InsertOrderItemSql, new
                {
                    OrderId = orderId,
                    l.EntryId,
                    VariantId = l.VariantId,
                    ProductTitle = l.Title,          // NVARCHAR(500)
                    SkuCode = Ansi(l.SkuCode, 100),
                    VariantLabel = l.VariantLabel,   // NVARCHAR(250)
                    ThumbnailUrl = Ansi(l.Thumb, 500),
                    Quantity = l.Qty,
                    UnitPrice = l.UnitPrice
                }, tx, cancellationToken: ct));

                itemResults.Add(new OrderItemResult(l.VariantId, l.EntryId, l.SkuCode, l.Title, l.Qty, l.UnitPrice, l.UnitPrice * l.Qty));
            }

            // 6) Tăng lượt dùng mã giảm giá.
            if (appliedCoupon is not null)
                await conn.ExecuteAsync(new CommandDefinition(
                    IncreaseCouponUsageSql, new { request.SiteId, CouponCode = Ansi(appliedCoupon, 50) }, tx, cancellationToken: ct));

            tx.Commit();

            return new CreateOrderResult(orderId, orderCode, "pending", "unpaid",
                subtotal, discount, request.ShippingFee, request.TaxAmount, total, appliedCoupon, itemResults);
        }
        catch
        {
            // using tx => rollback khi Dispose.
            throw;
        }
    }

    public async Task<UpdateOrderStatusResult?> UpdateOrderStatusAsync(Guid orderId, UpdateOrderStatusRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Anonymous object: Dapper tự map null -> DBNull.Value (COALESCE giữ nguyên giá trị cũ khi NULL).
        var row = await conn.QuerySingleOrDefaultAsync<(Guid Id, string OrderStatus, string PaymentStatus)>(
            new CommandDefinition(UpdateOrderStatusSql, new
            {
                OrderId = orderId,
                OrderStatus = request.OrderStatus,     // string? -> DBNull khi null
                PaymentStatus = request.PaymentStatus  // string? -> DBNull khi null
            }, cancellationToken: ct));

        if (row.Id == Guid.Empty) return null;
        return new UpdateOrderStatusResult(row.Id, row.OrderStatus, row.PaymentStatus);
    }

    public async Task<bool> DeleteOrderAsync(Guid orderId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // cms_ecommerce_order_items có FK ON DELETE CASCADE tới cms_ecommerce_orders.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            DeleteOrderSql, new { OrderId = orderId }, cancellationToken: ct));
        return affected > 0;
    }

    // ---------- Helpers ----------

    private static async Task<string> GenerateOrderCodeAsync(IDbConnection conn, IDbTransaction tx, Guid siteId, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var code = $"ORD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(1000, 9999)}";
            var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                OrderCodeExistsSql, new { SiteId = siteId, OrderCode = Ansi(code, 50) }, tx, cancellationToken: ct));
            if (exists == 0) return code;
        }
        throw new EcommerceException("Không sinh được order_code duy nhất, vui lòng thử lại.", 500);
    }

    /// <summary>Tính giảm giá theo loại mã; trả lý do nếu không hợp lệ.</summary>
    private static ValidatePromotionResult EvaluatePromotion(PromotionRow? promo, string couponCode, decimal orderAmount)
    {
        if (promo is null)
            return new ValidatePromotionResult(false, couponCode, 0, orderAmount, "Mã giảm giá không tồn tại.");
        if (!promo.IsActive)
            return new ValidatePromotionResult(false, couponCode, 0, orderAmount, "Mã giảm giá đang tắt.");

        var now = DateTimeOffset.UtcNow;
        if (promo.StartAt > now)
            return new ValidatePromotionResult(false, couponCode, 0, orderAmount, "Mã giảm giá chưa tới thời gian áp dụng.");
        if (promo.EndAt is { } end && end < now)
            return new ValidatePromotionResult(false, couponCode, 0, orderAmount, "Mã giảm giá đã hết hạn.");
        if (promo.UsageLimit is { } limit && promo.UsedCount >= limit)
            return new ValidatePromotionResult(false, couponCode, 0, orderAmount, "Mã giảm giá đã hết lượt sử dụng.");
        if (orderAmount < promo.MinOrderAmount)
            return new ValidatePromotionResult(false, couponCode, 0, orderAmount,
                $"Đơn hàng tối thiểu {promo.MinOrderAmount:0.##} để dùng mã này.");

        decimal discount = promo.DiscountType?.ToLowerInvariant() switch
        {
            "percentage" => orderAmount * promo.DiscountValue / 100m,
            "fixed_amount" => promo.DiscountValue,
            "free_shipping" => 0m,   // miễn phí ship: xử lý ở tầng phí vận chuyển
            _ => 0m
        };

        if (promo.MaxDiscountAmount is { } max && discount > max) discount = max;
        if (discount > orderAmount) discount = orderAmount;
        if (discount < 0) discount = 0;

        return new ValidatePromotionResult(true, promo.CouponCode, discount, orderAmount - discount, null);
    }

    /// <summary>Serialize JsonElement thành chuỗi JSON object; null/không phải object -> "{}".</summary>
    private static string ToJsonObject(JsonElement? element)
    {
        if (element is not { } e || e.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return "{}";
        if (e.ValueKind != JsonValueKind.Object)
            throw new EcommerceException("Trường JSON phải là object.");
        return e.GetRawText();
    }

    private static DbString Ansi(string? value, int length) =>
        new() { Value = value ?? string.Empty, IsAnsi = true, Length = length };

    // ---------- Row models (Dapper) ----------

    private sealed class PromotionRow
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

    private sealed class VariantRow
    {
        public Guid Id { get; set; }
        public Guid EntryId { get; set; }
        public string SkuCode { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal SalePrice { get; set; }
        public int StockQuantity { get; set; }
        public bool TrackInventory { get; set; }
        public bool IsActive { get; set; }
        public string? VariantOptions { get; set; }
    }
}
