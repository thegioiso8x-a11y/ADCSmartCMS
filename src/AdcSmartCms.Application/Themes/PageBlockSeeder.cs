namespace AdcSmartCms.Application.Themes;

// ---------- Page Block Seeder (Bước 1.5 mở rộng) ----------
// Biến mỗi template page_* thành 1 entry thuộc content type 'page' (single),
// rồi gắn các block (data-cms-block) của template vào entry qua cms_entry_blocks.
// Idempotent: entry page đã tồn tại (site_id, content_type_id, slug) thì bỏ qua;
// block khớp (entry_id, zone_key, component_type_id) đã có thì bỏ qua.

/// <summary>Một block bóc tách từ template page_* (zone_key = data-cms-block).</summary>
/// <param name="ZoneKey">Giá trị data-cms-block (VD: subpage_banner).</param>
/// <param name="SortOrder">Thứ tự xuất hiện trong template.</param>
public sealed record SeededPageBlock(string ZoneKey, int SortOrder);

/// <summary>Kết quả seed page: số entry page + block được tạo mới.</summary>
public sealed record PageSeedResult(
    int PagesCreated,
    int PagesSkipped,
    int BlocksCreated,
    int BlocksSkipped,
    IReadOnlyList<string> PageSlugs);

public interface IPageBlockSeeder
{
    /// <summary>
    /// Tạo entry 'page' cho mỗi template page_* + gắn block tương ứng vào cms_entry_blocks.
    /// Trả null nếu theme không tồn tại.
    /// </summary>
    Task<PageSeedResult?> SeedFromThemeAsync(Guid themeId, Guid siteId, CancellationToken ct);
}
