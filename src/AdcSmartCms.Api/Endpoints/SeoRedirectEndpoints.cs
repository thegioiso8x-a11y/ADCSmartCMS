using AdcSmartCms.Application.Seo;

namespace AdcSmartCms.Api.Endpoints;

public static class SeoRedirectEndpoints
{
    public static IEndpointRouteBuilder MapSeoRedirectEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/seo/redirects?siteId=...: danh sách redirect của site.
        app.MapGet("/api/seo/redirects", async (Guid? siteId, ISeoRedirectRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetRedirectsAsync(siteId.Value, ct));
        }).RequireAuthorization();

        // GET /api/seo/redirects/{id}: chi tiết 1 redirect.
        app.MapGet("/api/seo/redirects/{id:guid}", async (Guid id, ISeoRedirectRepository repo, CancellationToken ct) =>
        {
            var item = await repo.GetRedirectByIdAsync(id, ct);
            return item is null
                ? Results.NotFound(new { error = $"Không tìm thấy redirect '{id}'." })
                : Results.Ok(item);
        }).RequireAuthorization();

        // POST /api/seo/redirects: tạo redirect mới.
        app.MapPost("/api/seo/redirects", async (CreateSeoRedirectRequest request, ISeoRedirectRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.OldPath))
                return Results.BadRequest(new { error = "oldPath là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.NewPath))
                return Results.BadRequest(new { error = "newPath là bắt buộc." });
            if (request.StatusCode is not (301 or 302 or 307 or 308))
                return Results.BadRequest(new { error = "statusCode phải là 301, 302, 307 hoặc 308." });

            var created = await repo.CreateRedirectAsync(request, ct);
            return created is null
                ? Results.Conflict(new { error = $"old_path '{request.OldPath}' đã tồn tại trong site." })
                : Results.Json(created, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // PUT /api/seo/redirects/{id}: cập nhật redirect.
        app.MapPut("/api/seo/redirects/{id:guid}", async (Guid id, UpdateSeoRedirectRequest request, ISeoRedirectRepository repo, CancellationToken ct) =>
        {
            if (request.StatusCode is { } sc && sc is not (301 or 302 or 307 or 308))
                return Results.BadRequest(new { error = "statusCode phải là 301, 302, 307 hoặc 308." });

            bool updated;
            try
            {
                updated = await repo.UpdateRedirectAsync(id, request, ct);
            }
            catch (ArgumentException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }

            return updated
                ? Results.Ok(new { id, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy redirect '{id}'." });
        }).RequireAuthorization();

        // DELETE /api/seo/redirects/{id}: xóa redirect.
        app.MapDelete("/api/seo/redirects/{id:guid}", async (Guid id, ISeoRedirectRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteRedirectAsync(id, ct);
            return deleted
                ? Results.Ok(new { id, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy redirect '{id}'." });
        }).RequireAuthorization();

        return app;
    }
}
