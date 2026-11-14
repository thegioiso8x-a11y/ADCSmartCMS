using AdcSmartCms.Api.Contracts;
using AdcSmartCms.Application.Content;

namespace AdcSmartCms.Api.Endpoints;

public static class ContentEndpoints
{
    public static IEndpointRouteBuilder MapContentEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/content-types?siteId=...: danh sách content type (dùng chung + riêng của site nếu có siteId).
        app.MapGet("/api/content-types", async (Guid? siteId, IContentRepository repo, CancellationToken ct) =>
            Results.Ok(await repo.GetContentTypesAsync(siteId, ct)));

        // GET /api/content-types/{apiId}/fields?siteId=...: danh sách trường động của 1 content type.
        app.MapGet("/api/content-types/{apiId}/fields", async (string apiId, Guid? siteId, IContentRepository repo, CancellationToken ct) =>
        {
            var fields = await repo.GetFieldsAsync(apiId, siteId, ct);
            return fields is null
                ? Results.NotFound(new { error = $"Không tìm thấy content type api_id '{apiId}'." })
                : Results.Ok(fields);
        });

        // ---------- CRUD Content Types ----------

        // POST /api/content-types: tạo content type mới.
        app.MapPost("/api/content-types", async (CreateContentTypeRequest request, IContentRepository repo, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.ApiId))
                return Results.BadRequest(new { error = "apiId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.DisplayName))
                return Results.BadRequest(new { error = "displayName là bắt buộc." });

            var created = await repo.CreateContentTypeAsync(request, ct);
            return created is null
                ? Results.Conflict(new { error = $"apiId '{request.ApiId}' đã tồn tại." })
                : Results.Json(created, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // PUT /api/content-types/{id}: cập nhật content type.
        app.MapPut("/api/content-types/{id:guid}", async (Guid id, UpdateContentTypeRequest request, IContentRepository repo, CancellationToken ct) =>
        {
            var updated = await repo.UpdateContentTypeAsync(id, request, ct);
            return updated
                ? Results.Ok(new { id, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy content type '{id}'." });
        }).RequireAuthorization();

        // DELETE /api/content-types/{id}: xóa content type (cascade xóa fields).
        app.MapDelete("/api/content-types/{id:guid}", async (Guid id, IContentRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteContentTypeAsync(id, ct);
            return deleted
                ? Results.Ok(new { id, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy content type '{id}'." });
        }).RequireAuthorization();

        // ---------- CRUD Fields ----------

        // POST /api/content-types/{contentTypeId}/fields: tạo field mới.
        app.MapPost("/api/content-types/{contentTypeId:guid}/fields", async (Guid contentTypeId, CreateFieldRequest request, IContentRepository repo, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.FieldKey))
                return Results.BadRequest(new { error = "fieldKey là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.DisplayLabel))
                return Results.BadRequest(new { error = "displayLabel là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.FieldType))
                return Results.BadRequest(new { error = "fieldType là bắt buộc." });

            var created = await repo.CreateFieldAsync(contentTypeId, request, ct);
            return created is null
                ? Results.Conflict(new { error = "Content type không tồn tại hoặc fieldKey đã tồn tại." })
                : Results.Json(created, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // PUT /api/content-types/fields/{fieldId}: cập nhật field.
        app.MapPut("/api/content-types/fields/{fieldId:guid}", async (Guid fieldId, UpdateFieldRequest request, IContentRepository repo, CancellationToken ct) =>
        {
            var updated = await repo.UpdateFieldAsync(fieldId, request, ct);
            return updated
                ? Results.Ok(new { fieldId, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy field '{fieldId}'." });
        }).RequireAuthorization();

        // DELETE /api/content-types/fields/{fieldId}: xóa field.
        app.MapDelete("/api/content-types/fields/{fieldId:guid}", async (Guid fieldId, IContentRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteFieldAsync(fieldId, ct);
            return deleted
                ? Results.Ok(new { fieldId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy field '{fieldId}'." });
        }).RequireAuthorization();

        // POST /api/entries: tạo entry (base_data + localized_data JSON) rồi đồng bộ index qua SP.
        app.MapPost("/api/entries", async (CreateEntryRequest request, IContentRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.ContentTypeApiId))
                return Results.BadRequest(new { error = "contentTypeApiId là bắt buộc." });

            CreateEntryResult? result;
            try
            {
                result = await repo.CreateEntryAsync(request, ct);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }

            return result is null
                ? Results.NotFound(new { error = $"Không tìm thấy content type api_id '{request.ContentTypeApiId}'." })
                : Results.Json(new { entryId = result.EntryId, localeId = result.LocaleId, contentTypeId = result.ContentTypeId, status = result.Status },
                    statusCode: StatusCodes.Status201Created);
        });

        // GET /api/entries/{entryId}: chi tiết 1 entry theo locale (mặc định 'vi').
        app.MapGet("/api/entries/{entryId:guid}", async (Guid entryId, string? locale, IContentRepository repo, CancellationToken ct) =>
        {
            var loc = string.IsNullOrWhiteSpace(locale) ? "vi" : locale.Trim();
            var entry = await repo.GetEntryByIdAsync(entryId, loc, ct);
            return entry is null
                ? Results.NotFound(new { error = $"Không tìm thấy entry '{entryId}' với locale '{loc}'." })
                : Results.Ok(entry);
        }).RequireAuthorization();

        // GET /api/entries/filter: gọi SP usp_cms_dynamic_filter_entries (bộ lọc đa chiều + facet counts).
        app.MapGet("/api/entries/filter", async (
            Guid? siteId,
            string? contentTypeApiId,
            string? locale,
            string? keyword,
            string? filtersJson,
            string? sortField,
            string? sortDir,
            int? pageIndex,
            int? pageSize,
            IContentRepository repo,
            CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(contentTypeApiId))
                return Results.BadRequest(new { error = "contentTypeApiId là bắt buộc." });

            var query = new FilterEntriesQuery(
                SiteId: siteId.Value,
                ContentTypeApiId: contentTypeApiId.Trim(),
                Locale: string.IsNullOrWhiteSpace(locale) ? "vi" : locale.Trim(),
                Keyword: string.IsNullOrWhiteSpace(keyword) ? null : keyword.Trim(),
                FiltersJson: string.IsNullOrWhiteSpace(filtersJson) ? null : filtersJson,
                SortField: string.IsNullOrWhiteSpace(sortField) ? "published_at" : sortField.Trim(),
                SortDir: string.IsNullOrWhiteSpace(sortDir) ? "DESC" : sortDir.Trim().ToUpperInvariant(),
                PageIndex: pageIndex is null or < 1 ? 1 : pageIndex.Value,
                PageSize: pageSize is null or < 1 ? 10 : pageSize.Value);

            var result = await repo.FilterEntriesAsync(query, ct);
            return Results.Ok(new { items = result.Items, facets = result.Facets });
        });

        // PUT /api/entries/{entryId}/status: đổi trạng thái workflow; published -> set published_at.
        app.MapPut("/api/entries/{entryId:guid}/status", async (Guid entryId, UpdateStatusRequest request, IContentRepository repo, CancellationToken ct) =>
        {
            var allowed = new[] { "draft", "in_review", "approved", "scheduled", "published", "archived" };
            var status = request.Status?.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(status) || !allowed.Contains(status))
                return Results.BadRequest(new { error = $"status không hợp lệ. Hợp lệ: {string.Join(", ", allowed)}." });

            var result = await repo.UpdateStatusAsync(entryId, status, ct);
            return result is null
                ? Results.NotFound(new { error = $"Không tìm thấy entry '{entryId}'." })
                : Results.Ok(new { entryId = result.EntryId, status = result.Status, publishedAt = result.PublishedAt });
        });

        // PUT /api/entries/{entryId}: cập nhật entry (base_data + locale title/slug/localized_data) rồi đồng bộ index.
        app.MapPut("/api/entries/{entryId:guid}", async (Guid entryId, UpdateEntryRequest request, IContentRepository repo, CancellationToken ct) =>
        {
            var baseData = NormalizeJsonObject(request.BaseData);
            var localizedData = NormalizeJsonObject(request.LocalizedData);
            var locale = string.IsNullOrWhiteSpace(request.Locale) ? "vi" : request.Locale.Trim();

            var updated = await repo.UpdateEntryAsync(
                entryId,
                request.Title ?? string.Empty,
                request.Slug ?? string.Empty,
                baseData,
                localizedData,
                locale,
                ct);

            return updated
                ? Results.Ok(new { entryId, status = "updated", locale })
                : Results.NotFound(new { error = $"Không tìm thấy entry '{entryId}'." });
        }).RequireAuthorization();

        // DELETE /api/entries/{entryId}: xóa entry (bảng con xóa theo CASCADE).
        app.MapDelete("/api/entries/{entryId:guid}", async (Guid entryId, IContentRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteEntryAsync(entryId, ct);
            return deleted
                ? Results.Ok(new { entryId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy entry '{entryId}'." });
        }).RequireAuthorization();

        // GET /api/entries/{entryId}/versions: lịch sử phiên bản (version_number DESC).
        app.MapGet("/api/entries/{entryId:guid}/versions", async (Guid entryId, IContentRepository repo, CancellationToken ct) =>
            Results.Ok(await repo.GetVersionsAsync(entryId, ct)));

        return app;
    }

    /// <summary>Chuẩn hóa chuỗi JSON đầu vào: rỗng/không phải object -> "{}" (tránh vi phạm CHECK ISJSON).</summary>
    private static string NormalizeJsonObject(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "{}";
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(raw);
            return doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object ? raw : "{}";
        }
        catch (System.Text.Json.JsonException)
        {
            return "{}";
        }
    }
}
