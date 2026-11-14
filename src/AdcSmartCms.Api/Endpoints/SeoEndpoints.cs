using System.Text;
using AdcSmartCms.Application.Content;

namespace AdcSmartCms.Api.Endpoints;

public static class SeoEndpoints
{
    public static IEndpointRouteBuilder MapSeoEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/seo/sitemap?siteId=...: xuất sitemap.xml (entry published + is_indexable=1).
        app.MapGet("/api/seo/sitemap", async (Guid? siteId, IContentRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            var urls = await repo.GetSitemapAsync(siteId.Value, ct);

            var sb = new StringBuilder();
            sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            sb.Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
            foreach (var u in urls)
            {
                sb.Append("  <url>\n");
                sb.Append("    <loc>").Append(System.Security.SecurityElement.Escape(u.Loc)).Append("</loc>\n");
                if (u.LastMod is { } lm)
                    sb.Append("    <lastmod>").Append(lm.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ")).Append("</lastmod>\n");
                sb.Append("    <changefreq>").Append(u.ChangeFreq).Append("</changefreq>\n");
                sb.Append("    <priority>").Append(u.Priority.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)).Append("</priority>\n");
                sb.Append("  </url>\n");
            }
            sb.Append("</urlset>\n");

            return Results.Content(sb.ToString(), "application/xml", Encoding.UTF8);
        });

        return app;
    }
}
