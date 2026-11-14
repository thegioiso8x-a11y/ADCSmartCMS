using System.Data.Common;
using AdcSmartCms.Application.Media;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Smart DAM: Dapper repository cho cms_media_folders + cms_media_assets.
///  cms_media_folders: site_id, parent_id, folder_name NVARCHAR(150), folder_path VARCHAR(500), created_at
///  cms_media_assets: site_id, folder_id, file_name NVARCHAR(255), original_url VARCHAR(500), mime_type VARCHAR(100),
///                    file_ext VARCHAR(20), file_size_bytes BIGINT, width, height, thumb_url, webp_url, avif_url,
///                    focal_point JSON OBJECT, alt_text_locales JSON OBJECT, file_hash, uploaded_by, created_at
/// </summary>
public sealed class MediaRepository : IMediaRepository
{
    // ---------- Folders ----------

    private const string SelectFoldersSql = """
        SELECT id AS Id, site_id AS SiteId, parent_id AS ParentId, folder_name AS FolderName,
               folder_path AS FolderPath, created_at AS CreatedAt
        FROM dbo.cms_media_folders
        WHERE site_id = @SiteId
        ORDER BY folder_path;
        """;

    private const string ParentFolderPathSql = """
        SELECT folder_path FROM dbo.cms_media_folders
        WHERE id = @ParentId AND site_id = @SiteId;
        """;

    private const string InsertFolderSql = """
        INSERT INTO dbo.cms_media_folders (site_id, parent_id, folder_name, folder_path)
        OUTPUT INSERTED.id, INSERTED.site_id, INSERTED.parent_id, INSERTED.folder_name,
               INSERTED.folder_path, INSERTED.created_at
        VALUES (@SiteId, @ParentId, @FolderName, @FolderPath);
        """;

    // ---------- Assets ----------

    private const string SelectAssetColumns = """
        id AS Id, site_id AS SiteId, folder_id AS FolderId, file_name AS FileName,
        original_url AS OriginalUrl, mime_type AS MimeType, file_ext AS FileExt,
        file_size_bytes AS FileSizeBytes, width AS Width, height AS Height,
        thumb_url AS ThumbUrl, webp_url AS WebpUrl, avif_url AS AvifUrl,
        focal_point AS FocalPoint, alt_text_locales AS AltTextLocales, file_hash AS FileHash,
        uploaded_by AS UploadedBy, created_at AS CreatedAt
        """;

    private const string SelectAssetsSql = $"""
        SELECT {SelectAssetColumns}
        FROM dbo.cms_media_assets
        WHERE site_id = @SiteId AND (@FolderId IS NULL OR folder_id = @FolderId)
        ORDER BY created_at DESC;
        """;

    private const string SelectAssetByIdSql = $"""
        SELECT {SelectAssetColumns}
        FROM dbo.cms_media_assets
        WHERE id = @Id;
        """;

    private const string InsertAssetSql = $"""
        INSERT INTO dbo.cms_media_assets
            (site_id, folder_id, file_name, original_url, mime_type, file_ext, file_size_bytes,
             width, height, thumb_url, webp_url, avif_url, focal_point, alt_text_locales, file_hash, uploaded_by)
        OUTPUT INSERTED.id, INSERTED.site_id, INSERTED.folder_id, INSERTED.file_name,
               INSERTED.original_url, INSERTED.mime_type, INSERTED.file_ext, INSERTED.file_size_bytes,
               INSERTED.width, INSERTED.height, INSERTED.thumb_url, INSERTED.webp_url, INSERTED.avif_url,
               INSERTED.focal_point, INSERTED.alt_text_locales, INSERTED.file_hash, INSERTED.uploaded_by,
               INSERTED.created_at
        VALUES (@SiteId, @FolderId, @FileName, @OriginalUrl, @MimeType, @FileExt, @FileSizeBytes,
                @Width, @Height, @ThumbUrl, @WebpUrl, @AvifUrl, @FocalPoint, @AltTextLocales, @FileHash, @UploadedBy);
        """;

    private const string DeleteAssetSql = "DELETE FROM dbo.cms_media_assets WHERE id = @Id;";

    private const string UpdateAssetSql = """
        UPDATE dbo.cms_media_assets
        SET file_name        = COALESCE(@FileName, file_name),
            alt_text_locales = COALESCE(@AltTextLocales, alt_text_locales),
            folder_id        = COALESCE(@FolderId, folder_id)
        WHERE id = @Id;
        """;

    private readonly IDbConnectionFactory _factory;

    public MediaRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<MediaFolderDto>> GetFoldersBySiteAsync(Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<MediaFolderDto>(new CommandDefinition(
            SelectFoldersSql, new { SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<MediaFolderDto?> CreateFolderAsync(CreateMediaFolderRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Xác định folder_path của parent (nếu có). Parent phải thuộc cùng site.
        string parentPath = "/";
        if (request.ParentId is { } parentId)
        {
            var path = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
                ParentFolderPathSql, new { ParentId = parentId, request.SiteId }, cancellationToken: ct));
            if (path is null) return null; // parent không tồn tại hoặc khác site
            parentPath = path;
        }

        // folder_path dạng '/parent/slug/' (slug = folder_name đã chuẩn hóa).
        var slug = Slugify(request.FolderName);
        var folderPath = $"{parentPath}{slug}/";

        // Anonymous object: ParentId (Guid?) null -> DBNull tự động; FolderPath luôn có giá trị.
        return await conn.QuerySingleAsync<MediaFolderDto>(new CommandDefinition(InsertFolderSql, new
        {
            request.SiteId,
            request.ParentId,
            request.FolderName,
            FolderPath = folderPath
        }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<MediaAssetDto>> GetAssetsByFolderAsync(Guid siteId, Guid? folderId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<MediaAssetDto>(new CommandDefinition(
            SelectAssetsSql, new { SiteId = siteId, FolderId = folderId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<MediaAssetDto?> GetAssetByIdAsync(Guid id, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        return await conn.QuerySingleOrDefaultAsync<MediaAssetDto>(new CommandDefinition(
            SelectAssetByIdSql, new { Id = id }, cancellationToken: ct));
    }

    public async Task<MediaAssetDto> CreateAssetAsync(MediaAssetDto asset, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Anonymous object: Dapper tự map null -> DBNull.Value cho mọi cột nullable
        // (FolderId, Width, Height, ThumbUrl, WebpUrl, AvifUrl, FileHash, UploadedBy).
        // KHÔNG dùng DbString cho cột nullable (DbString null gây InvalidOperationException).
        return await conn.QuerySingleAsync<MediaAssetDto>(new CommandDefinition(InsertAssetSql, new
        {
            asset.SiteId,
            asset.FolderId,
            asset.FileName,
            asset.OriginalUrl,
            asset.MimeType,
            asset.FileExt,
            asset.FileSizeBytes,
            asset.Width,
            asset.Height,
            asset.ThumbUrl,
            asset.WebpUrl,
            asset.AvifUrl,
            asset.FocalPoint,
            asset.AltTextLocales,
            asset.FileHash,
            asset.UploadedBy
        }, cancellationToken: ct));
    }

    public async Task<string?> DeleteAssetAsync(Guid id, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Lấy original_url trước khi xóa để caller xóa file vật lý.
        var url = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
            "SELECT original_url FROM dbo.cms_media_assets WHERE id = @Id;", new { Id = id }, cancellationToken: ct));
        if (url is null) return null;

        await conn.ExecuteAsync(new CommandDefinition(DeleteAssetSql, new { Id = id }, cancellationToken: ct));
        return url;
    }

    public async Task<bool> UpdateAssetAsync(Guid id, UpdateMediaAssetRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Anonymous object: null -> DBNull.Value (COALESCE giữ nguyên giá trị cũ).
        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateAssetSql, new
        {
            Id = id,
            request.FileName,
            request.AltTextLocales,
            request.FolderId
        }, cancellationToken: ct));

        return affected > 0;
    }

    /// <summary>Chuẩn hóa tên thư mục thành slug an toàn cho path (chữ thường, số, gạch ngang).</summary>
    private static string Slugify(string name)
    {
        var lower = (name ?? string.Empty).Trim().ToLowerInvariant();
        var chars = lower.Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray();
        var slug = new string(chars);
        while (slug.Contains("--")) slug = slug.Replace("--", "-");
        slug = slug.Trim('-');
        return string.IsNullOrEmpty(slug) ? "folder" : slug;
    }
}
