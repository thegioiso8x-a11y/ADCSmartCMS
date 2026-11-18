using AdcSmartCms.Application.Themes;
using Microsoft.AspNetCore.Mvc;

namespace AdcSmartCms.Api.Endpoints;

public static class ThemeEndpoints
{
    public static IEndpointRouteBuilder MapThemeEndpoints(this IEndpointRouteBuilder app)
    {
        // DEBUG: multipart. Trường: file (bắt buộc), assetsBaseUrl (bắt buộc), themeCode, themeName, version (tùy chọn).
        // themeCode mặc định = slug của tên file zip; themeName mặc định = tên file zip (bỏ đuôi); version mặc định "1.0.0"
        // (giá trị DEFAULT của cột version). assetsBaseUrl KHÔNG có mặc định vì tài liệu chưa quy định nơi phục vụ asset.
        app.MapPost("/api/debug/import-theme", async (
            IFormFile? file,
            [FromForm] string? assetsBaseUrl,
            [FromForm] string? themeCode,
            [FromForm] string? themeName,
            [FromForm] string? version,
            IThemeImporter importer,
            CancellationToken ct) =>
        {
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "Thiếu tệp .zip (multipart field 'file')." });

            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var request = new ThemeImportRequest(
                ThemeCode: string.IsNullOrWhiteSpace(themeCode) ? ThemeNaming.Slugify(baseName) : themeCode.Trim(),
                ThemeName: string.IsNullOrWhiteSpace(themeName) ? baseName : themeName.Trim(),
                Version: string.IsNullOrWhiteSpace(version) ? "1.0.0" : version.Trim(),
                AssetsBaseUrl: assetsBaseUrl?.Trim() ?? string.Empty);

            var requestErrors = request.Validate();
            if (requestErrors.Count > 0)
                return Results.BadRequest(new { error = "Tham số import không hợp lệ.", details = requestErrors, request });

            await using var stream = file.OpenReadStream();
            var result = await importer.ImportAsync(stream, request, ct);

            return result.Status switch
            {
                ThemeImportStatus.LintFailed => Results.BadRequest(new
                {
                    error = "Gói theme không hợp lệ, chưa lưu gì vào DB.",
                    errorCount = result.Lint.ErrorCount,
                    warningCount = result.Lint.WarningCount,
                    issues = result.Lint.Issues
                }),
                ThemeImportStatus.DuplicateThemeCode => Results.Conflict(new
                {
                    error = $"theme_code '{request.ThemeCode}' đã tồn tại (UQ_cms_themes_code). Không ghi gì vào DB.",
                    request.ThemeCode
                }),
                _ => Results.Json(new
                {
                    status = result.Status,
                    themeId = result.ThemeId,
                    templateId = result.TemplateId,
                    request.ThemeCode,
                    templateKey = "layout_master",
                    templateType = "layout",
                    rootFolder = result.Lint.RootFolder,
                    warningCount = result.Lint.WarningCount,
                    warnings = result.Lint.Issues,
                    parsed = result.Parsed
                }, statusCode: StatusCodes.Status201Created)
            };
        }).DisableAntiforgery();

        // DEBUG (Bước 1.5): đọc extracted_schema của theme, sinh INSERT vào cms_content_types + cms_field_definitions.
        // Idempotent: chạy lại không nhân bản (bỏ qua content type/field đã tồn tại).
        app.MapPost("/api/debug/generate-schema/{themeId:guid}", async (
            Guid themeId,
            IAutoSchemaGenerator generator,
            CancellationToken ct) =>
        {
            var model = await generator.GenerateAsync(themeId, ct);
            if (model is null)
                return Results.NotFound(new { error = $"Không tìm thấy theme id '{themeId}'." });

            var persisted = await generator.PersistAsync(themeId, ct);

            return Results.Ok(new
            {
                status = "Generated",
                themeId,
                templatesRead = model.TemplatesRead,
                contentTypes = model.ContentTypes,
                warnings = model.Warnings,
                persisted
            });
        });

        // GET /api/themes: danh sách theme (mới nhất trước).
        // AllowAnonymous: Public Website cần đọc theme đang kích hoạt để render giao diện.
        app.MapGet("/api/themes", async (IThemeRepository repo, CancellationToken ct) =>
            Results.Ok(await repo.GetThemesAsync(ct))).AllowAnonymous();

        // PUT /api/themes/{id}/variables: cập nhật chuỗi JSON theme_variables.
        app.MapPut("/api/themes/{id:guid}/variables", async (
            Guid id,
            UpdateThemeVariablesRequest request,
            IThemeRepository repo,
            CancellationToken ct) =>
        {
            // theme_variables phải là JSON OBJECT (CHECK ISJSON(theme_variables, OBJECT)).
            if (request.ThemeVariables is not { } vars || vars.ValueKind is System.Text.Json.JsonValueKind.Null or System.Text.Json.JsonValueKind.Undefined)
                return Results.BadRequest(new { error = "themeVariables là bắt buộc." });
            if (vars.ValueKind != System.Text.Json.JsonValueKind.Object)
                return Results.BadRequest(new { error = "themeVariables phải là JSON object." });

            var updated = await repo.UpdateThemeVariablesAsync(id, vars.GetRawText(), ct);
            return updated is null
                ? Results.NotFound(new { error = $"Không tìm thấy theme '{id}'." })
                : Results.Ok(updated);
        }).RequireAuthorization();

        // GET /api/themes/{themeId}/templates: danh sách template (Liquid HTML + extracted_schema) của theme.
        // AllowAnonymous: Public Website cần đọc template để render giao diện.
        app.MapGet("/api/themes/{themeId:guid}/templates", async (
            Guid themeId,
            IThemeRepository repo,
            CancellationToken ct) =>
            Results.Ok(await repo.GetTemplatesAsync(themeId, ct))).AllowAnonymous();

        return app;
    }
}