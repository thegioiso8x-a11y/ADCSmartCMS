using System.Data;
using System.Data.Common;
using System.IO.Compression;
using System.Text.Encodings.Web;
using System.Text.Json;
using AdcSmartCms.Application.Themes;
using AdcSmartCms.Infrastructure.Data;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace AdcSmartCms.Api.Endpoints;

public static class ThemeEndpoints
{
    public static IEndpointRouteBuilder MapThemeEndpoints(this IEndpointRouteBuilder app)
    {
        // DEBUG: multipart. Trường: file (bắt buộc), assetsBaseUrl (bắt buộc), themeCode, themeName, version (tùy chọn).
        // themeCode mặc định = slug của tên file zip; themeName mặc định = tên file zip (bỏ đuôi); version mặc định "1.0.0"
        // (giá trị DEFAULT của cột version). Tự động chuẩn hóa assetsBaseUrl (khử lặp /assets) và giải nén file tĩnh ra wwwroot/themes/{themeCode}.
        app.MapPost("/api/debug/import-theme", async (
            IFormFile? file,
            [FromForm] string? assetsBaseUrl,
            [FromForm] string? themeCode,
            [FromForm] string? themeName,
            [FromForm] string? version,
            IThemeImporter importer,
            IWebHostEnvironment env,
            CancellationToken ct) =>
        {
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "Thiếu tệp .zip (multipart field 'file')." });

            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var resolvedThemeCode = string.IsNullOrWhiteSpace(themeCode) ? ThemeNaming.Slugify(baseName) : themeCode.Trim();

            var cleanAssetsBaseUrl = assetsBaseUrl?.Trim().TrimEnd('/') ?? string.Empty;
            if (cleanAssetsBaseUrl.EndsWith("/assets", StringComparison.OrdinalIgnoreCase))
            {
                cleanAssetsBaseUrl = cleanAssetsBaseUrl[..^7];
            }

            var request = new ThemeImportRequest(
                ThemeCode: resolvedThemeCode,
                ThemeName: string.IsNullOrWhiteSpace(themeName) ? baseName : themeName.Trim(),
                Version: string.IsNullOrWhiteSpace(version) ? "1.0.0" : version.Trim(),
                AssetsBaseUrl: cleanAssetsBaseUrl);

            var requestErrors = request.Validate();
            if (requestErrors.Count > 0)
                return Results.BadRequest(new { error = "Tham số import không hợp lệ.", details = requestErrors, request });

            await using var stream = file.OpenReadStream();
            var result = await importer.ImportAsync(stream, request, ct);

            if (result.Status is not ThemeImportStatus.LintFailed and not ThemeImportStatus.DuplicateThemeCode)
            {
                var webRoot = string.IsNullOrWhiteSpace(env.WebRootPath)
                    ? Path.Combine(env.ContentRootPath, "wwwroot")
                    : env.WebRootPath;

                var themeDir = Path.GetFullPath(Path.Combine(webRoot, "themes", request.ThemeCode));
                Directory.CreateDirectory(themeDir);

                var rootPrefix = string.IsNullOrWhiteSpace(result.Lint.RootFolder)
                    ? string.Empty
                    : result.Lint.RootFolder.Replace('\\', '/').Trim('/') + "/";

                await using var zipStream = file.OpenReadStream();
                using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);

                foreach (var entry in archive.Entries)
                {
                    if (string.IsNullOrEmpty(entry.Name))
                        continue;

                    if (entry.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
                        continue;

                    var normalizedEntryPath = entry.FullName.Replace('\\', '/').TrimStart('/');
                    if (rootPrefix.Length > 0 && normalizedEntryPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        normalizedEntryPath = normalizedEntryPath[rootPrefix.Length..];
                    }

                    if (string.IsNullOrWhiteSpace(normalizedEntryPath))
                        continue;

                    var destPath = Path.GetFullPath(Path.Combine(themeDir, normalizedEntryPath));
                    if (!destPath.StartsWith(themeDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(destPath, themeDir, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var destDir = Path.GetDirectoryName(destPath);
                    if (!string.IsNullOrEmpty(destDir))
                    {
                        Directory.CreateDirectory(destDir);
                    }

                    entry.ExtractToFile(destPath, overwrite: true);
                }
            }

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
        // Đồng thời bóc tách menu (<ul data-cms-menu>) từ layout_master để upsert vào cms_menus + cms_menu_items.
        // Idempotent: chạy lại không nhân bản (bỏ qua content type/field/menu/item đã tồn tại).
        app.MapPost("/api/debug/generate-schema/{themeId:guid}", async (
            Guid themeId,
            Guid? siteId,
            IAutoSchemaGenerator generator,
            IThemeMenuSeeder menuSeeder,
            IPageBlockSeeder pageSeeder,
            CancellationToken ct) =>
        {
            var model = await generator.GenerateAsync(themeId, ct);
            if (model is null)
                return Results.NotFound(new { error = $"Không tìm thấy theme id '{themeId}'." });

            // Resolve siteId TRƯỚC PersistAsync để content type được tạo đúng site.
            var resolvedSiteId = siteId is { } s && s != Guid.Empty
                ? s
                : Guid.Parse("2FD0078F-0043-4083-B34F-4BDF7BF6A604");

            var persisted = await generator.PersistAsync(themeId, resolvedSiteId, ct);

            // Seed menu từ HTML của layout_master cho site.
            var menuSeed = await menuSeeder.SeedFromThemeAsync(themeId, resolvedSiteId, ct);

            // Seed page entries + gắn block (data-cms-block) vào cms_entry_blocks.
            var pageSeed = await pageSeeder.SeedFromThemeAsync(themeId, resolvedSiteId, ct);

            return Results.Ok(new
            {
                status = "Generated",
                themeId,
                siteId = resolvedSiteId,
                templatesRead = model.TemplatesRead,
                contentTypes = model.ContentTypes,
                warnings = model.Warnings,
                persisted,
                menuSeed,
                pageSeed
            });
        });

        // DEBUG (T0-FIXd): re-parse extracted_schema từ raw_html (fallback compiled_html) bằng Parser MỚI.
        // Dùng khi Parser đã sửa (propagate ancestor collection) nhưng schema cũ trong DB chưa cập nhật.
        // KHÔNG gọi generate-schema — admin gọi tiếp POST /api/debug/generate-schema/{themeId}.
        app.MapPost("/api/debug/reparse-schema/{themeId:guid}", async (
            Guid themeId,
            IThemeParser parser,
            IThemeRepository repo,
            IDbConnectionFactory factory,
            CancellationToken ct) =>
        {
            var templates = await repo.GetTemplatesAsync(themeId, ct);
            if (templates.Count == 0)
                return Results.NotFound(new { error = $"Theme '{themeId}' không có template nào." });

            using var conn = factory.CreateConnection();
            if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

            var jsonOpts = new JsonSerializerOptions(JsonSerializerDefaults.Web)
            {
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };

            int reparsed = 0, fieldsTotal = 0;
            foreach (var t in templates)
            {
                // raw_html = source of truth (giữ nguyên HTML gốc); fallback compiled_html cho dữ liệu cũ.
                var raw = await conn.ExecuteScalarAsync<string?>(
                    "SELECT COALESCE(raw_html, compiled_html) FROM dbo.cms_theme_templates WHERE id = @Id",
                    new { Id = t.Id });
                if (string.IsNullOrWhiteSpace(raw)) continue;

                var parsed = parser.ParseHtml(raw);
                var json = JsonSerializer.Serialize(parsed, jsonOpts);
                await conn.ExecuteAsync(
                    "UPDATE dbo.cms_theme_templates SET extracted_schema = @Json WHERE id = @Id",
                    new { Json = json, Id = t.Id });
                reparsed++;
                fieldsTotal += parsed.Fields.Count;
            }

            return Results.Ok(new
            {
                status = "Reparsed",
                themeId,
                templatesReparsed = reparsed,
                fieldsExtractedTotal = fieldsTotal
            });
        });

        // GET /api/themes?siteId=...: danh sách theme (mới nhất trước).
        // siteId != null => đánh dấu IsActive cho theme đang dùng của site đó.
        // AllowAnonymous: Public Website cần đọc theme đang kích hoạt để render giao diện.
        app.MapGet("/api/themes", async (Guid? siteId, IThemeRepository repo, CancellationToken ct) =>
            Results.Ok(await repo.GetThemesAsync(siteId, ct))).AllowAnonymous();

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

        // DELETE /api/themes/{id}: xóa theme (cascade xóa templates) + xóa thư mục file vật lý.
        // Chặn xóa nếu theme đang là active_theme_id của bất kỳ site nào (409 Conflict).
        app.MapDelete("/api/themes/{id:guid}", async (
            Guid id,
            IThemeRepository repo,
            IWebHostEnvironment env,
            CancellationToken ct) =>
        {
            var result = await repo.DeleteAsync(id, ct);
            switch (result.Status)
            {
                case ThemeDeleteStatus.NotFound:
                    return Results.NotFound(new { error = $"Không tìm thấy theme '{id}'." });

                case ThemeDeleteStatus.InUse:
                    return Results.Conflict(new
                    {
                        error = $"Không thể xóa theme '{id}' vì đang được {result.SitesUsing} site sử dụng làm giao diện active.",
                        sitesUsing = result.SitesUsing
                    });

                default:
                    // Bước 3: Xóa thư mục file vật lý wwwroot/themes/{theme_code} (bọc try/catch).
                    if (!string.IsNullOrWhiteSpace(result.ThemeCode))
                    {
                        try
                        {
                            var webRoot = string.IsNullOrWhiteSpace(env.WebRootPath)
                                ? Path.Combine(env.ContentRootPath, "wwwroot")
                                : env.WebRootPath;
                            var themeDir = Path.GetFullPath(Path.Combine(webRoot, "themes", result.ThemeCode));
                            if (Directory.Exists(themeDir))
                            {
                                Directory.Delete(themeDir, recursive: true);
                            }
                        }
                        catch
                        {
                            // Không chặn phản hồi nếu xóa file thất bại (DB đã xóa thành công).
                        }
                    }
                    return Results.Ok(new { id, status = "deleted" });
            }
        }).RequireAuthorization();

        return app;
    }
}

