namespace AdcSmartCms.Application.Themes;

// ---------- Theme Menu Seeder (Bước 1.5 mở rộng) ----------
// Khi generate-schema/import-theme, bóc tách các vùng <ul data-cms-menu="{menuCode}"> trong
// layout_master để upsert vào cms_menus + cms_menu_items (hỗ trợ đệ quy mục cha - con).
// Idempotent: menu đã có thì bỏ qua; item khớp (menu_id, title, url) đã có thì bỏ qua.

/// <summary>Một mục menu bóc tách từ HTML (đệ quy qua Children).</summary>
/// <param name="Title">Nhãn hiển thị (text trong thẻ &lt;a&gt;).</param>
/// <param name="Url">custom_url đã map (VD: /tin-tuc). Null nếu không có href.</param>
/// <param name="LinkType">'custom' | 'collection' | 'entry' (theo map link tĩnh).</param>
/// <param name="Children">Các mục con (Mega Menu).</param>
public sealed record SeededMenuItem(
    string Title,
    string? Url,
    string LinkType,
    IReadOnlyList<SeededMenuItem> Children);

/// <summary>Một menu bóc tách từ HTML (menuCode + danh sách mục gốc).</summary>
public sealed record SeededMenu(
    string MenuCode,
    IReadOnlyList<SeededMenuItem> Items);

/// <summary>Kết quả seed menu: số menu/mục được tạo mới.</summary>
public sealed record MenuSeedResult(
    int MenusCreated,
    int MenusSkipped,
    int ItemsCreated,
    int ItemsSkipped,
    IReadOnlyList<string> MenuCodes);

public interface IThemeMenuSeeder
{
    /// <summary>
    /// Bóc tách menu từ HTML của layout_master và upsert vào DB cho site.
    /// Trả null nếu theme không tồn tại.
    /// </summary>
    Task<MenuSeedResult?> SeedFromThemeAsync(Guid themeId, Guid siteId, CancellationToken ct);

    /// <summary>Bóc tách danh sách menu (chưa ghi DB) từ 1 chuỗi HTML.</summary>
    IReadOnlyList<SeededMenu> ParseMenus(string html);
}

