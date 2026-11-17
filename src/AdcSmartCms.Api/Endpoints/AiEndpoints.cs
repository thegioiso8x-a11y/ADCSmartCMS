using AdcSmartCms.Application.Ai;

namespace AdcSmartCms.Api.Endpoints;

public static class AiEndpoints
{
    public static IEndpointRouteBuilder MapAiEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/ai/generate-seo: sinh MetaTitle, MetaDescription, Tags (Mock).
        app.MapPost("/api/ai/generate-seo", async (AiSeoRequest request, IAiService ai, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title) && string.IsNullOrWhiteSpace(request.Content))
                return Results.BadRequest(new { error = "Cần ít nhất title hoặc content." });

            return Results.Ok(await ai.GenerateSeoAsync(request, ct));
        });

        // POST /api/ai/translate: dịch văn bản (Mock).
        app.MapPost("/api/ai/translate", async (AiTranslateRequest request, IAiService ai, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Text))
                return Results.BadRequest(new { error = "text là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.TargetLang))
                return Results.BadRequest(new { error = "targetLang là bắt buộc." });

            var translated = await ai.TranslateAsync(request, ct);
            return Results.Ok(new AiTranslateResult(
                translated,
                string.IsNullOrWhiteSpace(request.SourceLang) ? "vi" : request.SourceLang,
                request.TargetLang,
                "mock",
                true));
        });

        // ---------- AI Settings CRUD (chỉ super admin) ----------

        // GET /api/ai/settings/{siteId}: lấy cấu hình AI (key đã mask).
        app.MapGet("/api/ai/settings/{siteId:guid}", async (Guid siteId, HttpContext http, IAiSettingsRepository repo, CancellationToken ct) =>
        {
            if (!IsSuperAdmin(http)) return Results.Forbid();
            if (siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetSettingsAsync(siteId, ct));
        }).RequireAuthorization();

        // PUT /api/ai/settings/{siteId}: upsert cấu hình AI.
        app.MapPut("/api/ai/settings/{siteId:guid}", async (Guid siteId, UpdateAiSettingsRequest request, HttpContext http, IAiSettingsRepository repo, CancellationToken ct) =>
        {
            if (!IsSuperAdmin(http)) return Results.Forbid();
            if (siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            try
            {
                return Results.Ok(await repo.UpsertSettingsAsync(siteId, request, ct));
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                // Thiếu ENV ADC_AI_MASTER_KEY khi cần mã hóa key mới.
                return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status500InternalServerError);
            }
        }).RequireAuthorization();

        return app;
    }

    /// <summary>Kiểm tra claim is_super_admin = "true" trong JWT.</summary>
    private static bool IsSuperAdmin(HttpContext http) =>
        string.Equals(http.User.FindFirst("is_super_admin")?.Value, "true", StringComparison.OrdinalIgnoreCase);
}
