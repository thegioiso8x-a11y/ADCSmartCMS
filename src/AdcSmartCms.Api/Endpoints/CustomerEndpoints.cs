using AdcSmartCms.Application.Customers;

namespace AdcSmartCms.Api.Endpoints;

public static class CustomerEndpoints
{
    public static IEndpointRouteBuilder MapCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/customers?siteId=...&keyword=...: danh sách khách hàng (tổng hợp từ đơn hàng).
        app.MapGet("/api/customers", async (Guid? siteId, string? keyword, ICustomerRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetCustomersAsync(siteId.Value, keyword, ct));
        }).RequireAuthorization();

        // GET /api/customers/{id}: chi tiết khách + lịch sử đơn hàng.
        // {id} là CustomerKey: "user:{guid}" hoặc "guest:{phone|email|name}".
        app.MapGet("/api/customers/{id}", async (string id, Guid? siteId, ICustomerRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(id))
                return Results.BadRequest(new { error = "id là bắt buộc." });

            var detail = await repo.GetCustomerByIdAsync(siteId.Value, id, ct);
            return detail is null
                ? Results.NotFound(new { error = $"Không tìm thấy khách hàng '{id}'." })
                : Results.Ok(detail);
        }).RequireAuthorization();

        return app;
    }
}
