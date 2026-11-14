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

        return app;
    }
}
