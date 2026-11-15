using AdcSmartCms.Application.Ecommerce;

namespace AdcSmartCms.Api.Endpoints;

public static class EcommerceEndpoints
{
    public static IEndpointRouteBuilder MapEcommerceEndpoints(this IEndpointRouteBuilder app)
    {
        // ---------- Variants ----------

        // POST /api/ecommerce/variants: tạo biến thể cho 1 entry.
        app.MapPost("/api/ecommerce/variants", async (CreateVariantRequest request, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (request.EntryId == Guid.Empty)
                return Results.BadRequest(new { error = "entryId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.SkuCode))
                return Results.BadRequest(new { error = "skuCode là bắt buộc." });
            if (request.Price < 0 || request.SalePrice < 0)
                return Results.BadRequest(new { error = "price/salePrice không được âm." });
            if (request.StockQuantity < 0)
                return Results.BadRequest(new { error = "stockQuantity không được âm." });

            VariantDto? variant;
            try
            {
                variant = await repo.CreateVariantAsync(request, ct);
            }
            catch (EcommerceException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }

            return variant is null
                ? Results.Conflict(new { error = "Entry không tồn tại trong site hoặc skuCode đã tồn tại." })
                : Results.Json(variant, statusCode: StatusCodes.Status201Created);
        });

        // GET /api/ecommerce/variants?entryId=...: danh sách biến thể của 1 sản phẩm.
        app.MapGet("/api/ecommerce/variants", async (Guid? entryId, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (entryId is null || entryId == Guid.Empty)
                return Results.BadRequest(new { error = "entryId là bắt buộc." });

            return Results.Ok(await repo.GetVariantsByEntryAsync(entryId.Value, ct));
        });

        // PUT /api/ecommerce/variants/{variantId}: cập nhật price, sale_price, stock_quantity, variant_options.
        app.MapPut("/api/ecommerce/variants/{variantId:guid}", async (Guid variantId, UpdateVariantRequest request, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (request.Price is < 0 || request.SalePrice is < 0)
                return Results.BadRequest(new { error = "price/salePrice không được âm." });
            if (request.StockQuantity is < 0)
                return Results.BadRequest(new { error = "stockQuantity không được âm." });

            bool updated;
            try
            {
                updated = await repo.UpdateVariantAsync(variantId, request, ct);
            }
            catch (EcommerceException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }

            return updated
                ? Results.Ok(new { variantId, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy variant '{variantId}'." });
        }).RequireAuthorization();

        // DELETE /api/ecommerce/variants/{variantId}: xóa variant.
        app.MapDelete("/api/ecommerce/variants/{variantId:guid}", async (Guid variantId, IEcommerceRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteVariantAsync(variantId, ct);
            return deleted
                ? Results.Ok(new { variantId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy variant '{variantId}'." });
        }).RequireAuthorization();

        // ---------- Promotions ----------

        // POST /api/ecommerce/promotions: tạo mã giảm giá.
        app.MapPost("/api/ecommerce/promotions", async (CreatePromotionRequest request, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.CouponCode))
                return Results.BadRequest(new { error = "couponCode là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.Title))
                return Results.BadRequest(new { error = "title là bắt buộc." });

            var allowed = new[] { "percentage", "fixed_amount", "free_shipping" };
            var type = request.DiscountType?.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(type) || !allowed.Contains(type))
                return Results.BadRequest(new { error = $"discountType không hợp lệ. Hợp lệ: {string.Join(", ", allowed)}." });
            if (request.DiscountValue < 0)
                return Results.BadRequest(new { error = "discountValue không được âm." });
            if (request.EndAt is { } end && end <= request.StartAt)
                return Results.BadRequest(new { error = "endAt phải sau startAt." });

            var result = await repo.CreatePromotionAsync(request with { DiscountType = type }, ct);
            return result is null
                ? Results.Conflict(new { error = $"couponCode '{request.CouponCode}' đã tồn tại trong site." })
                : Results.Json(result, statusCode: StatusCodes.Status201Created);
        });

        // POST /api/ecommerce/promotions/validate: kiểm tra mã + tính số tiền giảm.
        app.MapPost("/api/ecommerce/promotions/validate", async (ValidatePromotionRequest request, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.CouponCode))
                return Results.BadRequest(new { error = "couponCode là bắt buộc." });
            if (request.OrderAmount < 0)
                return Results.BadRequest(new { error = "orderAmount không được âm." });

            return Results.Ok(await repo.ValidatePromotionAsync(request, ct));
        });

        // GET /api/ecommerce/promotions?siteId=...: danh sách mã giảm giá của site (mới nhất trước).
        app.MapGet("/api/ecommerce/promotions", async (Guid? siteId, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetPromotionsAsync(siteId.Value, ct));
        }).RequireAuthorization();

        // PUT /api/ecommerce/promotions/{promoId}: cập nhật title, discount_value, is_active.
        app.MapPut("/api/ecommerce/promotions/{promoId:guid}", async (Guid promoId, UpdatePromotionRequest request, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (request.DiscountValue is < 0)
                return Results.BadRequest(new { error = "discountValue không được âm." });

            var updated = await repo.UpdatePromotionAsync(promoId, request, ct);
            return updated
                ? Results.Ok(new { promoId, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy promotion '{promoId}'." });
        }).RequireAuthorization();

        // DELETE /api/ecommerce/promotions/{promoId}: xóa mã giảm giá.
        app.MapDelete("/api/ecommerce/promotions/{promoId:guid}", async (Guid promoId, IEcommerceRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeletePromotionAsync(promoId, ct);
            return deleted
                ? Results.Ok(new { promoId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy promotion '{promoId}'." });
        }).RequireAuthorization();

        // ---------- Orders ----------

        // POST /api/ecommerce/orders: tạo đơn hàng (transaction ACID: tính tiền, áp mã, trừ tồn kho, insert).
        app.MapPost("/api/ecommerce/orders", async (CreateOrderRequest request, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (request.Items is null || request.Items.Count == 0)
                return Results.BadRequest(new { error = "items phải có ít nhất 1 phần tử." });
            if (request.Items.Any(i => i.VariantId == Guid.Empty))
                return Results.BadRequest(new { error = "variantId trong items là bắt buộc." });
            if (request.Items.Any(i => i.Quantity <= 0))
                return Results.BadRequest(new { error = "quantity phải > 0." });

            try
            {
                var result = await repo.CreateOrderAsync(request, ct);
                return Results.Json(result, statusCode: StatusCodes.Status201Created);
            }
            catch (EcommerceException ex)
            {
                return Results.Json(new { error = ex.Message }, statusCode: ex.StatusCode);
            }
        });

        // GET /api/ecommerce/orders?siteId=...&orderStatus=...: danh sách đơn hàng (mới nhất trước).
        app.MapGet("/api/ecommerce/orders", async (Guid? siteId, string? orderStatus, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetOrdersAsync(siteId.Value, orderStatus, ct));
        }).RequireAuthorization();

        // GET /api/ecommerce/orders/{orderId}: chi tiết đơn hàng kèm order_items.
        app.MapGet("/api/ecommerce/orders/{orderId:guid}", async (Guid orderId, IEcommerceRepository repo, CancellationToken ct) =>
        {
            var detail = await repo.GetOrderByIdAsync(orderId, ct);
            return detail is null
                ? Results.NotFound(new { error = $"Không tìm thấy đơn hàng '{orderId}'." })
                : Results.Ok(detail);
        }).RequireAuthorization();

        // PUT /api/ecommerce/orders/{orderId}/status: cập nhật order_status / payment_status.
        app.MapPut("/api/ecommerce/orders/{orderId:guid}/status", async (Guid orderId, UpdateOrderStatusRequest request, IEcommerceRepository repo, CancellationToken ct) =>
        {
            if (request.OrderStatus is null && request.PaymentStatus is null)
                return Results.BadRequest(new { error = "Cần ít nhất orderStatus hoặc paymentStatus." });

            var result = await repo.UpdateOrderStatusAsync(orderId, request, ct);
            return result is null
                ? Results.NotFound(new { error = $"Không tìm thấy đơn hàng '{orderId}'." })
                : Results.Ok(result);
        }).RequireAuthorization();

        // DELETE /api/ecommerce/orders/{orderId}: xóa đơn hàng (cascade xóa order_items).
        app.MapDelete("/api/ecommerce/orders/{orderId:guid}", async (Guid orderId, IEcommerceRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteOrderAsync(orderId, ct);
            return deleted
                ? Results.Ok(new { orderId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy đơn hàng '{orderId}'." });
        }).RequireAuthorization();

        return app;
    }
}
