using AdcSmartCms.Application.Sites;

namespace AdcSmartCms.Api.Endpoints;

public static class SiteEndpoints
{
    public static IEndpointRouteBuilder MapSiteEndpoints(this IEndpointRouteBuilder app)
    {
        // PUT /api/sites/{siteId}/active-theme: kích hoạt theme cho site.
        // Body: { "themeId": "guid" } để kích hoạt, hoặc { "themeId": null } để gỡ theme.
        app.MapPut("/api/sites/{siteId:guid}/active-theme", async (
            Guid siteId,
            SetActiveThemeRequest request,
            ISiteRepository repo,
            CancellationToken ct) =>
        {
            var result = await repo.SetActiveThemeAsync(siteId, request.ThemeId, ct);
            return result is null
                ? Results.NotFound(new { error = $"Không tìm thấy site '{siteId}'." })
                : Results.Ok(new { siteId = result.SiteId, activeThemeId = result.ActiveThemeId, status = "updated" });
        }).RequireAuthorization();

        return app;
    }
}
