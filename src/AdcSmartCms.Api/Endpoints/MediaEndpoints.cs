using AdcSmartCms.Application.Media;

namespace AdcSmartCms.Api.Endpoints;

public static class MediaEndpoints
{
    /// <summary>Thư mục vật lý lưu file upload (tương đối với thư mục chạy app).</summary>
    private const string UploadsRoot = "uploads";

    public static IEndpointRouteBuilder MapMediaEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/media/folders?siteId=...: danh sách thư mục media của site.
        app.MapGet("/api/media/folders", async (Guid? siteId, IMediaRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetFoldersBySiteAsync(siteId.Value, ct));
        }).RequireAuthorization();

        // POST /api/media/folders: tạo thư mục media.
        app.MapPost("/api/media/folders", async (CreateMediaFolderRequest request, IMediaRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.FolderName))
                return Results.BadRequest(new { error = "folderName là bắt buộc." });

            var created = await repo.CreateFolderAsync(request, ct);
            return created is null
                ? Results.BadRequest(new { error = "parentId không tồn tại hoặc không thuộc site này." })
                : Results.Json(created, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // GET /api/media/assets?siteId=...&folderId=...: danh sách file theo site + folder (folderId null = tất cả).
        app.MapGet("/api/media/assets", async (Guid? siteId, Guid? folderId, IMediaRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetAssetsByFolderAsync(siteId.Value, folderId, ct));
        }).RequireAuthorization();

        // POST /api/media/upload: nhận IFormFile + siteId + folderId, lưu file vào /uploads/, insert DB.
        app.MapPost("/api/media/upload", async (
            IFormFile? file,
            Guid? siteId,
            Guid? folderId,
            IMediaRepository repo,
            IWebHostEnvironment env,
            CancellationToken ct) =>
        {
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "Thiếu tệp (multipart field 'file')." });
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            // Đảm bảo thư mục uploads tồn tại.
            var uploadsDir = Path.Combine(env.ContentRootPath, UploadsRoot);
            Directory.CreateDirectory(uploadsDir);

            // Tên file duy nhất: {guid}{ext} để tránh trùng.
            var ext = Path.GetExtension(file.FileName);
            var storedName = $"{Guid.NewGuid():N}{ext}";
            var physicalPath = Path.Combine(uploadsDir, storedName);

            // Lưu file vật lý.
            await using (var stream = File.Create(physicalPath))
            {
                await file.CopyToAsync(stream, ct);
            }

            // URL tương đối để client truy cập (cần cấu hình static files ở Program.cs).
            var originalUrl = $"/{UploadsRoot}/{storedName}";

            var asset = new MediaAssetDto
            {
                SiteId = siteId.Value,
                FolderId = folderId,
                FileName = file.FileName,
                OriginalUrl = originalUrl,
                MimeType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                FileExt = ext.TrimStart('.').ToLowerInvariant(),
                FileSizeBytes = file.Length,
                FocalPoint = "{\"x\":0.5,\"y\":0.5}",
                AltTextLocales = "{}",
            };

            try
            {
                var created = await repo.CreateAssetAsync(asset, ct);
                return Results.Json(created, statusCode: StatusCodes.Status201Created);
            }
            catch
            {
                // Nếu insert DB lỗi, xóa file vật lý vừa lưu để tránh rác.
                if (File.Exists(physicalPath)) File.Delete(physicalPath);
                throw;
            }
        }).DisableAntiforgery().RequireAuthorization();

        // PUT /api/media/assets/{id}: cập nhật thông tin file (file_name, alt_text_locales, folder_id).
        app.MapPut("/api/media/assets/{id:guid}", async (Guid id, UpdateMediaAssetRequest request, IMediaRepository repo, CancellationToken ct) =>
        {
            var updated = await repo.UpdateAssetAsync(id, request, ct);
            return updated
                ? Results.Ok(new { id, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy asset '{id}'." });
        }).RequireAuthorization();

        // DELETE /api/media/assets/{id}: xóa file (DB + vật lý).
        app.MapDelete("/api/media/assets/{id:guid}", async (
            Guid id,
            IMediaRepository repo,
            IWebHostEnvironment env,
            CancellationToken ct) =>
        {
            var originalUrl = await repo.DeleteAssetAsync(id, ct);
            if (originalUrl is null)
                return Results.NotFound(new { error = $"Không tìm thấy asset '{id}'." });

            // Xóa file vật lý nếu tồn tại (bỏ qua lỗi nếu file đã mất).
            try
            {
                var fileName = Path.GetFileName(originalUrl);
                var physicalPath = Path.Combine(env.ContentRootPath, UploadsRoot, fileName);
                if (File.Exists(physicalPath)) File.Delete(physicalPath);
            }
            catch
            {
                // Bỏ qua lỗi xóa file vật lý; DB đã xóa thành công.
            }

            return Results.Ok(new { id, status = "deleted" });
        }).RequireAuthorization();

        return app;
    }
}
