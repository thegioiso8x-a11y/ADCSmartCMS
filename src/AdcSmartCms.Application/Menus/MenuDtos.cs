using System.Text.Json;

namespace AdcSmartCms.Application.Menus;

// ---------- Milestone 4.1: Quản lý Menu đa cấp ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_menus: site_id, menu_code VARCHAR(100), menu_name NVARCHAR(150), is_active BIT
//  cms_menu_items: menu_id, parent_id, title_locales NVARCHAR(MAX) CHECK ISJSON(OBJECT),
//                  link_type VARCHAR(30) ('entry'|'collection'|'custom'), target_entry_id, custom_url NVARCHAR(500),
//                  target_blank BIT, icon_class VARCHAR(100), hierarchy_path VARCHAR(500), sort_order INT, is_visible BIT

/// <summary>Một Menu (bảng cms_menus).</summary>
public sealed class MenuDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public string MenuCode { get; set; } = string.Empty;
    public string MenuName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Một mục menu phẳng (bảng cms_menu_items) - dùng để dựng cây.</summary>
public sealed class MenuItemDto
{
    public Guid Id { get; set; }
    public Guid MenuId { get; set; }
    public Guid? ParentId { get; set; }
    public string TitleLocales { get; set; } = "{}";   // JSON string (raw)
    public string LinkType { get; set; } = "custom";
    public Guid? TargetEntryId { get; set; }
    public string? CustomUrl { get; set; }
    public bool TargetBlank { get; set; }
    public string? IconClass { get; set; }
    public string? HierarchyPath { get; set; }
    public int SortOrder { get; set; }
    public bool IsVisible { get; set; }
}

/// <summary>Node trong cây menu trả về cho client (đệ quy qua Children).</summary>
public sealed class MenuItemNode
{
    public Guid Id { get; set; }
    public Guid? ParentId { get; set; }
    public JsonElement TitleLocales { get; set; }
    public string LinkType { get; set; } = "custom";
    public Guid? TargetEntryId { get; set; }
    public string? CustomUrl { get; set; }
    public bool TargetBlank { get; set; }
    public string? IconClass { get; set; }
    public string? HierarchyPath { get; set; }
    public int SortOrder { get; set; }
    public bool IsVisible { get; set; }
    public List<MenuItemNode> Children { get; set; } = new();
}

/// <summary>Kết quả GET /api/menus: thông tin menu + cây mục menu đa cấp.</summary>
public sealed record MenuTreeResult(MenuDto Menu, IReadOnlyList<MenuItemNode> Items);

/// <summary>Body của POST /api/menus.</summary>
public sealed record CreateMenuRequest(Guid SiteId, string MenuCode, string MenuName, bool IsActive = true);

/// <summary>Body của PUT /api/menus/{menuId}. null = giữ nguyên giá trị cũ.</summary>
public sealed record UpdateMenuRequest(string? MenuName, bool? IsActive);

/// <summary>
/// Body của POST /api/menus/{menuId}/items.
/// TitleLocales: object JSON đa ngôn ngữ, VD {"vi":"Sản phẩm","en":"Products"}.
/// LinkType: 'entry' | 'collection' | 'custom'. Với 'entry'/'collection' cần TargetEntryId; 'custom' cần CustomUrl.
/// </summary>
public sealed record CreateMenuItemRequest(
    Guid? ParentId,
    JsonElement? TitleLocales,
    string LinkType,
    Guid? TargetEntryId,
    string? CustomUrl,
    bool TargetBlank = false,
    string? IconClass = null,
    int SortOrder = 0,
    bool IsVisible = true);

/// <summary>Kết quả tạo menu item (kèm hierarchy_path đã sinh).</summary>
public sealed record CreateMenuItemResult(
    Guid Id,
    Guid MenuId,
    Guid? ParentId,
    string LinkType,
    string? HierarchyPath,
    int SortOrder);

/// <summary>
/// Body của PUT /api/menus/{menuId}/items/{itemId}.
/// Chỉ cập nhật các trường hiển thị/điều hướng; null = giữ nguyên giá trị cũ.
/// ParentId: null = giữ nguyên; Guid.Empty = chuyển thành mục gốc (parent_id = NULL);
///           Guid khác = chuyển sang làm con của mục đó (tự tính lại hierarchy_path cho cả cây con).
/// </summary>
public sealed record UpdateMenuItemRequest(
    JsonElement? TitleLocales,
    string? CustomUrl,
    int? SortOrder,
    bool? TargetBlank,
    Guid? ParentId = null);

public interface IMenuRepository
{
    /// <summary>Lấy menu theo site + menu_code; null nếu không tồn tại.</summary>
    Task<MenuDto?> GetMenuAsync(Guid siteId, string menuCode, CancellationToken ct);

    /// <summary>Lấy danh sách tất cả menu của site (mới nhất trước).</summary>
    Task<IReadOnlyList<MenuDto>> GetMenusBySiteAsync(Guid siteId, CancellationToken ct);

    /// <summary>Lấy toàn bộ mục menu (phẳng, sắp theo hierarchy_path) của 1 menu.</summary>
    Task<IReadOnlyList<MenuItemDto>> GetMenuItemsAsync(Guid menuId, CancellationToken ct);

    /// <summary>Tạo menu mới; trả null nếu menu_code đã tồn tại trong site.</summary>
    Task<MenuDto?> CreateMenuAsync(CreateMenuRequest request, CancellationToken ct);

    /// <summary>Cập nhật menu gốc (menu_name, is_active). Trả false nếu menu không tồn tại.</summary>
    Task<bool> UpdateMenuAsync(Guid menuId, UpdateMenuRequest request, CancellationToken ct);

    /// <summary>
    /// Tạo menu item. Tự sinh hierarchy_path dạng '/parentPath/{id}/'.
    /// Trả null nếu menu không tồn tại hoặc parent_id không thuộc cùng menu.
    /// </summary>
    Task<CreateMenuItemResult?> CreateMenuItemAsync(Guid menuId, CreateMenuItemRequest request, CancellationToken ct);

    /// <summary>
    /// Cập nhật menu item (title_locales, custom_url, sort_order, target_blank).
    /// Trả false nếu item không tồn tại hoặc không thuộc menu.
    /// </summary>
    Task<bool> UpdateMenuItemAsync(Guid menuId, Guid itemId, UpdateMenuItemRequest request, CancellationToken ct);

    /// <summary>Xóa menu (cascade xóa items). Trả false nếu menu không tồn tại.</summary>
    Task<bool> DeleteMenuAsync(Guid menuId, CancellationToken ct);

    /// <summary>
    /// Xóa 1 menu item. Trả false nếu item không tồn tại hoặc không thuộc menu.
    /// Ném ArgumentException nếu item còn mục con (phải xóa con trước).
    /// </summary>
    Task<bool> DeleteMenuItemAsync(Guid menuId, Guid itemId, CancellationToken ct);
}
