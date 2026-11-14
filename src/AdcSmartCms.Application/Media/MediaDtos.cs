namespace AdcSmartCms.Application.Media;

// ---------- Smart DAM & Media Library ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_media_folders: site_id, parent_id, folder_name NVARCHAR(150), folder_path VARCHAR(500), created_at
//  cms_media_assets: site_id, folder_id, file_name NVARCHAR(255), original_url VARCHAR(500), mime_type VARCHAR(100),
//                    file_ext VARCHAR(20), file_size_bytes BIGINT, width, height, thumb_url, webp_url, avif_url,
//                    focal_point NVARCHAR(100) JSON OBJECT, alt_text_locales NVARCHAR(MAX) JSON OBJECT,
//                    file_hash VARCHAR(64), uploaded_by, created_at

/// <summary>Một thư mục media (bảng cms_media_folders).</summary>
public sealed class MediaFolderDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public Guid? ParentId { get; set; }
    public string FolderName { get; set; } = string.Empty;
    public string FolderPath { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Một tài sản media (bảng cms_media_assets).</summary>
public sealed class MediaAssetDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public Guid? FolderId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string OriginalUrl { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public string FileExt { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public string? ThumbUrl { get; set; }
    public string? WebpUrl { get; set; }
    public string? AvifUrl { get; set; }
    public string FocalPoint { get; set; } = "{\"x\":0.5,\"y\":0.5}";   // JSON string (raw)
    public string AltTextLocales { get; set; } = "{}";                  // JSON string (raw)
    public string? FileHash { get; set; }
    public Guid? UploadedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Body của POST /api/media/folders.</summary>
public sealed record CreateMediaFolderRequest(
    Guid SiteId,
    string FolderName,
    Guid? ParentId = null);

/// <summary>Kết quả upload 1 file media.</summary>
public sealed record UploadMediaResult(
    Guid Id,
    string FileName,
    string OriginalUrl,
    string MimeType,
    long FileSizeBytes);

/// <summary>
/// Body của PUT /api/media/assets/{id}.
/// null = giữ nguyên. AltTextLocales là chuỗi JSON object (VD {"vi":"Ảnh sản phẩm"}).
/// </summary>
public sealed record UpdateMediaAssetRequest(
    string? FileName,
    string? AltTextLocales,
    Guid? FolderId);

public interface IMediaRepository
{
    /// <summary>Danh sách thư mục media của site (sắp theo folder_path).</summary>
    Task<IReadOnlyList<MediaFolderDto>> GetFoldersBySiteAsync(Guid siteId, CancellationToken ct);

    /// <summary>Tạo thư mục media; tự tính folder_path từ parent. Trả null nếu parent không thuộc site.</summary>
    Task<MediaFolderDto?> CreateFolderAsync(CreateMediaFolderRequest request, CancellationToken ct);

    /// <summary>Danh sách asset của site, lọc theo folderId (null = tất cả).</summary>
    Task<IReadOnlyList<MediaAssetDto>> GetAssetsByFolderAsync(Guid siteId, Guid? folderId, CancellationToken ct);

    /// <summary>Lấy 1 asset theo id; null nếu không tồn tại.</summary>
    Task<MediaAssetDto?> GetAssetByIdAsync(Guid id, CancellationToken ct);

    /// <summary>Insert 1 asset (sau khi đã lưu file vật lý). Trả DTO vừa tạo.</summary>
    Task<MediaAssetDto> CreateAssetAsync(MediaAssetDto asset, CancellationToken ct);

    /// <summary>Xóa asset; trả về original_url để caller xóa file vật lý. Null nếu không tồn tại.</summary>
    Task<string?> DeleteAssetAsync(Guid id, CancellationToken ct);

    /// <summary>Cập nhật asset (file_name, alt_text_locales, folder_id). Trả false nếu không tồn tại.</summary>
    Task<bool> UpdateAssetAsync(Guid id, UpdateMediaAssetRequest request, CancellationToken ct);
}
