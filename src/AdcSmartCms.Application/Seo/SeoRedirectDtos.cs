namespace AdcSmartCms.Application.Seo;

// ---------- Technical SEO: Quản lý điều hướng 301/302 ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_seo_redirects: site_id, old_path NVARCHAR(500), new_path NVARCHAR(500), status_code SMALLINT DEFAULT 301,
//                     is_regex BIT, hits_count BIGINT, last_hit_at, note NVARCHAR(255), created_at
//                     UNIQUE (site_id, old_path)

/// <summary>Một bản ghi redirect (bảng cms_seo_redirects).</summary>
public sealed class SeoRedirectDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public string OldPath { get; set; } = string.Empty;
    public string NewPath { get; set; } = string.Empty;
    public short StatusCode { get; set; }
    public bool IsRegex { get; set; }
    public long HitsCount { get; set; }
    public DateTimeOffset? LastHitAt { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Body của POST /api/seo/redirects.</summary>
public sealed record CreateSeoRedirectRequest(
    Guid SiteId,
    string OldPath,
    string NewPath,
    short StatusCode = 301,
    bool IsRegex = false,
    string? Note = null);

/// <summary>
/// Body của PUT /api/seo/redirects/{id}.
/// null = giữ nguyên giá trị cũ.
/// </summary>
public sealed record UpdateSeoRedirectRequest(
    string? OldPath,
    string? NewPath,
    short? StatusCode,
    bool? IsRegex,
    string? Note);

public interface ISeoRedirectRepository
{
    /// <summary>Danh sách redirect của site (mới nhất trước).</summary>
    Task<IReadOnlyList<SeoRedirectDto>> GetRedirectsAsync(Guid siteId, CancellationToken ct);

    /// <summary>Lấy 1 redirect theo id; null nếu không tồn tại.</summary>
    Task<SeoRedirectDto?> GetRedirectByIdAsync(Guid id, CancellationToken ct);

    /// <summary>Tạo redirect; trả null nếu (site_id, old_path) đã tồn tại.</summary>
    Task<SeoRedirectDto?> CreateRedirectAsync(CreateSeoRedirectRequest request, CancellationToken ct);

    /// <summary>Cập nhật redirect; trả false nếu không tồn tại.</summary>
    Task<bool> UpdateRedirectAsync(Guid id, UpdateSeoRedirectRequest request, CancellationToken ct);

    /// <summary>Xóa redirect; trả false nếu không tồn tại.</summary>
    Task<bool> DeleteRedirectAsync(Guid id, CancellationToken ct);
}
