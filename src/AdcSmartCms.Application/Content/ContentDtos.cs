using System.Text.Json;

namespace AdcSmartCms.Application.Content;

// ---------- Bước 1.6: Dynamic Content CRUD ----------
// Đọc schema (content types + fields) và tạo Entry (base_data + localized_data JSON),
// sau đó gọi SP usp_cms_sync_entry_indexes để đồng bộ bảng index phục vụ bộ lọc.

/// <summary>Một Content Type (bảng cms_content_types).</summary>
public sealed record ContentTypeDto(
    Guid Id,
    string ApiId,
    string DisplayName,
    string Kind);

/// <summary>Một định nghĩa trường động (bảng cms_field_definitions).</summary>
public sealed record FieldDefinitionDto(
    Guid Id,
    string FieldKey,
    string DisplayLabel,
    string FieldType,
    bool IsRequired,
    bool IsFilterable,
    bool IsLocalized);

// ---------- CRUD Content Types ----------

/// <summary>Body của POST /api/content-types.</summary>
public sealed record CreateContentTypeRequest(
    Guid? SiteId,
    string ApiId,
    string DisplayName,
    string Kind = "collection",
    string? Description = null,
    bool IsLocalized = true,
    bool EnableVersioning = true,
    bool EnableWorkflow = false);

/// <summary>Body của PUT /api/content-types/{id}. null = giữ nguyên.</summary>
public sealed record UpdateContentTypeRequest(
    string? DisplayName,
    string? Kind,
    string? Description,
    bool? IsLocalized,
    bool? EnableVersioning,
    bool? EnableWorkflow);

// ---------- CRUD Fields ----------

/// <summary>Body của POST /api/content-types/{contentTypeId}/fields.</summary>
public sealed record CreateFieldRequest(
    string FieldKey,
    string DisplayLabel,
    string FieldType,
    bool IsRequired = false,
    bool IsUnique = false,
    bool IsLocalized = false,
    bool IsSearchable = true,
    bool IsIndexed = false,
    bool IsFilterable = false,
    string? FilterType = null,
    int SortOrder = 0);

/// <summary>Body của PUT /api/content-types/fields/{fieldId}. null = giữ nguyên.</summary>
public sealed record UpdateFieldRequest(
    string? DisplayLabel,
    string? FieldType,
    bool? IsRequired,
    bool? IsUnique,
    bool? IsLocalized,
    bool? IsSearchable,
    bool? IsIndexed,
    bool? IsFilterable,
    string? FilterType,
    int? SortOrder);

/// <summary>
/// Body của POST /api/entries.
/// BaseData / LocalizedData là object JSON tùy ý (dữ liệu động), sẽ được serialize lại thành chuỗi
/// để lưu vào cột NVARCHAR(MAX) có CHECK ISJSON(..., OBJECT).
/// </summary>
public sealed record CreateEntryRequest(
    Guid SiteId,
    string ContentTypeApiId,
    string? Title,
    string? Slug,
    JsonElement? BaseData,
    JsonElement? LocalizedData,
    string Locale = "vi");

/// <summary>Kết quả tạo Entry.</summary>
public sealed record CreateEntryResult(
    Guid EntryId,
    Guid LocaleId,
    Guid ContentTypeId,
    string Status);

// ---------- Bước 2.1: Faceted Filter ----------
// Gọi SP dbo.usp_cms_dynamic_filter_entries (2 result sets: items phân trang + facets thống kê).

/// <summary>Tham số cho GET /api/entries/filter (đã chuẩn hóa từ query string).</summary>
public sealed record FilterEntriesQuery(
    Guid SiteId,
    string ContentTypeApiId,
    string Locale,
    string? Keyword,
    string? FiltersJson,
    string SortField,
    string SortDir,
    int PageIndex,
    int PageSize);

/// <summary>
/// Một bản ghi trong Result Set 1 (danh sách phân trang).
/// Dùng class + get;set; (không phải record positional) để Dapper materialize được
/// khi bật DefaultTypeMap.MatchNamesWithUnderscores (cột snake_case -> thuộc tính PascalCase).
/// </summary>
public sealed class FilteredEntryItem
{
    public long TotalRecords { get; set; }
    public Guid EntryId { get; set; }
    public string? Title { get; set; }
    public string? Slug { get; set; }
    public string? BaseData { get; set; }        // JSON string (raw)
    public string? LocalizedData { get; set; }   // JSON string (raw)
    public string? SeoMeta { get; set; }         // JSON string (raw)
    public DateTimeOffset? PublishedAt { get; set; }
    public decimal? DynamicSortValue { get; set; }
}

/// <summary>Một dòng trong Result Set 2 (facet counts cho thanh bộ lọc).</summary>
public sealed class FacetCount
{
    public string FieldKey { get; set; } = string.Empty;
    public string? FieldLabel { get; set; }
    public string? FilterType { get; set; }
    public string? FilterValue { get; set; }
    public string? FilterDisplayText { get; set; }
    public int MatchingCount { get; set; }
}

/// <summary>Kết quả tổng hợp trả về cho client: { items, facets }.</summary>
public sealed record FilterEntriesResult(
    IReadOnlyList<FilteredEntryItem> Items,
    IReadOnlyList<FacetCount> Facets);

// ---------- Bước 3: Workflow, Versioning & SEO ----------

/// <summary>Body của PUT /api/entries/{entryId}/status.</summary>
public sealed record UpdateStatusRequest(string Status);

/// <summary>Kết quả cập nhật trạng thái.</summary>
public sealed record UpdateStatusResult(Guid EntryId, string Status, DateTimeOffset? PublishedAt);

/// <summary>Một dòng lịch sử phiên bản (bảng cms_entry_versions).</summary>
public sealed class EntryVersionDto
{
    public int VersionNumber { get; set; }
    public string? ChangeSummary { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Một URL trong sitemap.</summary>
public sealed record SitemapUrl(string Loc, DateTimeOffset? LastMod, decimal Priority, string ChangeFreq);

/// <summary>
/// Chi tiết 1 entry theo (entryId, locale) — dùng cho GET /api/entries/{entryId}.
/// BaseData / LocalizedData là chuỗi JSON raw (client tự parse).
/// </summary>
public sealed class EntryDetailResponse
{
    public Guid Id { get; set; }
    public string? Title { get; set; }
    public string? Slug { get; set; }
    public string? BaseData { get; set; }        // JSON string (raw)
    public string? LocalizedData { get; set; }   // JSON string (raw)
    public string? Status { get; set; }
}

public interface IContentRepository
{
    /// <summary>
    /// Danh sách content type. siteId null => chỉ loại dùng chung (site_id IS NULL);
    /// siteId có giá trị => gồm cả loại dùng chung lẫn loại riêng của site đó.
    /// </summary>
    Task<IReadOnlyList<ContentTypeDto>> GetContentTypesAsync(Guid? siteId, CancellationToken ct);

    /// <summary>Danh sách trường của 1 content type theo api_id; null nếu không tìm thấy content type.</summary>
    Task<IReadOnlyList<FieldDefinitionDto>?> GetFieldsAsync(string apiId, Guid? siteId, CancellationToken ct);

    /// <summary>
    /// Tạo 1 entry + 1 bản ghi locale trong CÙNG 1 transaction, rồi gọi SP usp_cms_sync_entry_indexes.
    /// Trả null nếu content type api_id không tồn tại.
    /// </summary>
    Task<CreateEntryResult?> CreateEntryAsync(CreateEntryRequest request, CancellationToken ct);

    /// <summary>Chi tiết 1 entry theo (entryId, locale); null nếu không tìm thấy.</summary>
    Task<EntryDetailResponse?> GetEntryByIdAsync(Guid entryId, string locale, CancellationToken ct);

    /// <summary>
    /// Cập nhật entry: cms_entries.base_data + cms_entry_locales (title, slug, localized_data) theo locale,
    /// rồi đồng bộ lại bảng index qua SP usp_cms_sync_entry_indexes. Trả false nếu entry không tồn tại.
    /// </summary>
    Task<bool> UpdateEntryAsync(Guid entryId, string title, string slug, string baseData, string localizedData, string locale, CancellationToken ct);

    /// <summary>Xóa entry (các bảng con xóa theo ON DELETE CASCADE). Trả false nếu entry không tồn tại.</summary>
    Task<bool> DeleteEntryAsync(Guid entryId, CancellationToken ct);

    /// <summary>Gọi SP usp_cms_dynamic_filter_entries, đọc 2 result sets (items + facets).</summary>
    Task<FilterEntriesResult> FilterEntriesAsync(FilterEntriesQuery query, CancellationToken ct);

    /// <summary>Cập nhật status; nếu published thì set published_at. Trả null nếu entry không tồn tại.</summary>
    Task<UpdateStatusResult?> UpdateStatusAsync(Guid entryId, string status, CancellationToken ct);

    /// <summary>Lịch sử phiên bản của entry (version_number DESC).</summary>
    Task<IReadOnlyList<EntryVersionDto>> GetVersionsAsync(Guid entryId, CancellationToken ct);

    /// <summary>Danh sách URL sitemap: entry published + is_indexable=1 của site.</summary>
    Task<IReadOnlyList<SitemapUrl>> GetSitemapAsync(Guid siteId, CancellationToken ct);

    // ---------- CRUD Content Types ----------

    /// <summary>Tạo content type; trả null nếu (site_id, api_id) đã tồn tại.</summary>
    Task<ContentTypeDto?> CreateContentTypeAsync(CreateContentTypeRequest request, CancellationToken ct);

    /// <summary>Cập nhật content type; trả false nếu không tồn tại.</summary>
    Task<bool> UpdateContentTypeAsync(Guid id, UpdateContentTypeRequest request, CancellationToken ct);

    /// <summary>Xóa content type (cascade xóa fields). Trả false nếu không tồn tại.</summary>
    Task<bool> DeleteContentTypeAsync(Guid id, CancellationToken ct);

    // ---------- CRUD Fields ----------

    /// <summary>Tạo field cho content type; trả null nếu content type không tồn tại hoặc field_key đã tồn tại.</summary>
    Task<FieldDefinitionDto?> CreateFieldAsync(Guid contentTypeId, CreateFieldRequest request, CancellationToken ct);

    /// <summary>Cập nhật field; trả false nếu không tồn tại.</summary>
    Task<bool> UpdateFieldAsync(Guid fieldId, UpdateFieldRequest request, CancellationToken ct);

    /// <summary>Xóa field; trả false nếu không tồn tại.</summary>
    Task<bool> DeleteFieldAsync(Guid fieldId, CancellationToken ct);
}
