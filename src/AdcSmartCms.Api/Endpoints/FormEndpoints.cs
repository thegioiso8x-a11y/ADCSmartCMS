using System.Text.Json;
using AdcSmartCms.Application.Forms;

namespace AdcSmartCms.Api.Endpoints;

public static class FormEndpoints
{
    public static IEndpointRouteBuilder MapFormEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/forms/{formCode}/submit?siteId=...: nhận mọi cặp key-value, lưu vào cms_form_submissions.
        app.MapPost("/api/forms/{formCode}/submit", async (
            string formCode,
            Guid? siteId,
            JsonElement body,
            HttpContext http,
            IFormRepository repo,
            CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(formCode))
                return Results.BadRequest(new { error = "formCode là bắt buộc." });
            if (body.ValueKind != JsonValueKind.Object)
                return Results.BadRequest(new { error = "Body phải là JSON object (các cặp key-value)." });

            // Metadata nguồn truy cập (UTM, page URL, IP, UserAgent) - tùy chọn.
            var tracking = JsonSerializer.Serialize(new
            {
                page_url = http.Request.Headers.Referer.ToString(),
                ip = http.Connection.RemoteIpAddress?.ToString(),
                user_agent = http.Request.Headers.UserAgent.ToString()
            }, JsonSerializerOptions.Web);

            var result = await repo.SubmitAsync(siteId.Value, formCode.Trim(), body, tracking, ct);
            return result is null
                ? Results.NotFound(new { error = $"Không tìm thấy form '{formCode}' (hoặc form đang tắt) cho site '{siteId}'." })
                : Results.Json(result, statusCode: StatusCodes.Status201Created);
        });

        // ---------- CRUD định nghĩa form (cms_forms) ----------

        // GET /api/forms?siteId=...: danh sách form của site.
        app.MapGet("/api/forms", async (Guid? siteId, IFormRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetFormsAsync(siteId.Value, ct));
        }).RequireAuthorization();

        // GET /api/forms/{formId}: chi tiết 1 form.
        app.MapGet("/api/forms/{formId:guid}", async (Guid formId, IFormRepository repo, CancellationToken ct) =>
        {
            var form = await repo.GetFormByIdAsync(formId, ct);
            return form is null
                ? Results.NotFound(new { error = $"Không tìm thấy form '{formId}'." })
                : Results.Ok(form);
        }).RequireAuthorization();

        // POST /api/forms: tạo định nghĩa form mới.
        app.MapPost("/api/forms", async (CreateFormRequest request, IFormRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.FormCode))
                return Results.BadRequest(new { error = "formCode là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.FormName))
                return Results.BadRequest(new { error = "formName là bắt buộc." });

            FormDto? created;
            try
            {
                created = await repo.CreateFormAsync(request, ct);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (Microsoft.Data.SqlClient.SqlException ex)
            {
                // CHECK constraint ISJSON trong DB bắt chuỗi JSON sai định dạng.
                return Results.BadRequest(new { error = $"Dữ liệu JSON không hợp lệ: {ex.Message}" });
            }

            return created is null
                ? Results.Conflict(new { error = $"formCode '{request.FormCode}' đã tồn tại trong site." })
                : Results.Json(created, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // PUT /api/forms/{formId}: cập nhật định nghĩa form.
        app.MapPut("/api/forms/{formId:guid}", async (Guid formId, UpdateFormRequest request, IFormRepository repo, CancellationToken ct) =>
        {
            bool updated;
            try
            {
                updated = await repo.UpdateFormAsync(formId, request, ct);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (Microsoft.Data.SqlClient.SqlException ex)
            {
                return Results.BadRequest(new { error = $"Dữ liệu JSON không hợp lệ: {ex.Message}" });
            }

            return updated
                ? Results.Ok(new { formId, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy form '{formId}'." });
        }).RequireAuthorization();

        // DELETE /api/forms/{formId}: xóa form (cascade xóa submissions).
        app.MapDelete("/api/forms/{formId:guid}", async (Guid formId, IFormRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteFormAsync(formId, ct);
            return deleted
                ? Results.Ok(new { formId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy form '{formId}'." });
        }).RequireAuthorization();

        return app;
    }
}
