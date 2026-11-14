using System.Data;
using System.Data.Common;
using System.Text.Json;
using AdcSmartCms.Application.Menus;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Milestone 4.1: Dapper repository cho Menu đa cấp.
///  cms_menus: site_id, menu_code VARCHAR(100), menu_name NVARCHAR(150), is_active BIT
///  cms_menu_items: menu_id, parent_id, title_locales NVARCHAR(MAX) JSON OBJECT, link_type VARCHAR(30),
///                  target_entry_id, custom_url NVARCHAR(500), target_blank BIT, icon_class VARCHAR(100),
///                  hierarchy_path VARCHAR(500), sort_order INT, is_visible BIT
/// hierarchy_path dạng '/{id1}/{id2}/' cho phép sắp xếp cây bằng ORDER BY thay vì đệ quy.
/// </summary>
public sealed class MenuRepository : IMenuRepository
{
    private const string SelectMenuSql = """
        SELECT id AS Id, site_id AS SiteId, menu_code AS MenuCode, menu_name AS MenuName,
               is_active AS IsActive, created_at AS CreatedAt
        FROM dbo.cms_menus
        WHERE site_id = @SiteId AND menu_code = @MenuCode;
        """;

    private const string SelectMenusBySiteSql = """
        SELECT id AS Id, site_id AS SiteId, menu_code AS MenuCode, menu_name AS MenuName,
               is_active AS IsActive, created_at AS CreatedAt
        FROM dbo.cms_menus
        WHERE site_id = @SiteId
        ORDER BY created_at DESC;
        """;

    private const string SelectMenuItemsSql = """
        SELECT id AS Id, menu_id AS MenuId, parent_id AS ParentId, title_locales AS TitleLocales,
               link_type AS LinkType, target_entry_id AS TargetEntryId, custom_url AS CustomUrl,
               target_blank AS TargetBlank, icon_class AS IconClass, hierarchy_path AS HierarchyPath,
               sort_order AS SortOrder, is_visible AS IsVisible
        FROM dbo.cms_menu_items
        WHERE menu_id = @MenuId
        ORDER BY hierarchy_path, sort_order, id;
        """;

    private const string InsertMenuSql = """
        INSERT INTO dbo.cms_menus (site_id, menu_code, menu_name, is_active)
        OUTPUT INSERTED.id, INSERTED.site_id, INSERTED.menu_code, INSERTED.menu_name,
               INSERTED.is_active, INSERTED.created_at
        VALUES (@SiteId, @MenuCode, @MenuName, @IsActive);
        """;

    private const string MenuCodeExistsSql = "SELECT COUNT(1) FROM dbo.cms_menus WHERE site_id = @SiteId AND menu_code = @MenuCode;";

    private const string UpdateMenuSql = """
        UPDATE dbo.cms_menus
        SET menu_name = COALESCE(@MenuName, menu_name),
            is_active = COALESCE(@IsActive, is_active)
        WHERE id = @MenuId;
        """;

    private const string MenuExistsSql = "SELECT COUNT(1) FROM dbo.cms_menus WHERE id = @MenuId;";

    private const string ParentPathSql = """
        SELECT hierarchy_path FROM dbo.cms_menu_items
        WHERE id = @ParentId AND menu_id = @MenuId;
        """;

    private const string InsertMenuItemSql = """
        INSERT INTO dbo.cms_menu_items
            (menu_id, parent_id, title_locales, link_type, target_entry_id, custom_url,
             target_blank, icon_class, hierarchy_path, sort_order, is_visible)
        OUTPUT INSERTED.id, INSERTED.menu_id, INSERTED.parent_id, INSERTED.link_type,
               INSERTED.hierarchy_path, INSERTED.sort_order
        VALUES (@MenuId, @ParentId, @TitleLocales, @LinkType, @TargetEntryId, @CustomUrl,
                @TargetBlank, @IconClass, @HierarchyPath, @SortOrder, @IsVisible);
        """;

    private const string UpdateMenuItemSql = """
        UPDATE dbo.cms_menu_items
        SET title_locales = COALESCE(@TitleLocales, title_locales),
            custom_url    = COALESCE(@CustomUrl, custom_url),
            sort_order    = COALESCE(@SortOrder, sort_order),
            target_blank  = COALESCE(@TargetBlank, target_blank)
        WHERE id = @ItemId AND menu_id = @MenuId;
        """;

    // Cập nhật parent_id + hierarchy_path của chính item (dùng khi đổi cha).
    private const string UpdateMenuItemParentSql = """
        UPDATE dbo.cms_menu_items
        SET parent_id      = @ParentId,
            hierarchy_path = @HierarchyPath
        WHERE id = @ItemId AND menu_id = @MenuId;
        """;

    // Lấy hierarchy_path hiện tại của item (để tính lại cây con khi đổi cha).
    private const string ItemPathSql = """
        SELECT hierarchy_path FROM dbo.cms_menu_items
        WHERE id = @ItemId AND menu_id = @MenuId;
        """;

    // Lấy toàn bộ item con cháu (hierarchy_path bắt đầu bằng path cũ) để rebuild path.
    private const string DescendantsSql = """
        SELECT id AS Id, hierarchy_path AS HierarchyPath
        FROM dbo.cms_menu_items
        WHERE menu_id = @MenuId AND hierarchy_path LIKE @OldPrefix + '%' AND id <> @ItemId;
        """;

    private const string UpdateItemPathSql = """
        UPDATE dbo.cms_menu_items SET hierarchy_path = @HierarchyPath WHERE id = @ItemId;
        """;

    // Kiểm tra parentId mới có phải là descendant của itemId không (dựa vào hierarchy_path).
    // Nếu hierarchy_path của parent mới bắt đầu bằng hierarchy_path của item hiện tại => parent mới nằm trong cây con của item => vòng lặp.
    private const string IsDescendantSql = """
        SELECT COUNT(1)
        FROM dbo.cms_menu_items child
        INNER JOIN dbo.cms_menu_items self ON self.id = @ItemId AND self.menu_id = @MenuId
        WHERE child.id = @ParentId
          AND child.menu_id = @MenuId
          AND child.hierarchy_path LIKE self.hierarchy_path + '%';
        """;

    private const string DeleteMenuSql = "DELETE FROM dbo.cms_menus WHERE id = @MenuId;";

    private const string MenuItemExistsSql = "SELECT COUNT(1) FROM dbo.cms_menu_items WHERE id = @ItemId AND menu_id = @MenuId;";

    private const string MenuItemChildCountSql = "SELECT COUNT(1) FROM dbo.cms_menu_items WHERE parent_id = @ItemId;";

    private const string DeleteMenuItemSql = "DELETE FROM dbo.cms_menu_items WHERE id = @ItemId AND menu_id = @MenuId;";

    private readonly IDbConnectionFactory _factory;

    public MenuRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<MenuDto?> GetMenuAsync(Guid siteId, string menuCode, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<MenuDto>(new CommandDefinition(
            SelectMenuSql, new { SiteId = siteId, MenuCode = Ansi(menuCode, 100) }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<MenuDto>> GetMenusBySiteAsync(Guid siteId, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);
        var rows = await conn.QueryAsync<MenuDto>(new CommandDefinition(
            SelectMenusBySiteSql, new { SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<MenuItemDto>> GetMenuItemsAsync(Guid menuId, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);
        var rows = await conn.QueryAsync<MenuItemDto>(new CommandDefinition(
            SelectMenuItemsSql, new { MenuId = menuId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<MenuDto?> CreateMenuAsync(CreateMenuRequest request, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            MenuCodeExistsSql, new { SiteId = request.SiteId, MenuCode = Ansi(request.MenuCode, 100) }, cancellationToken: ct));
        if (exists > 0) return null;

        return await conn.QuerySingleAsync<MenuDto>(new CommandDefinition(InsertMenuSql, new
        {
            request.SiteId,
            MenuCode = Ansi(request.MenuCode, 100),
            MenuName = request.MenuName,   // NVARCHAR(150)
            request.IsActive
        }, cancellationToken: ct));
    }

    public async Task<bool> UpdateMenuAsync(Guid menuId, UpdateMenuRequest request, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);
        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateMenuSql, new
        {
            MenuId = menuId,
            MenuName = request.MenuName,   // NVARCHAR(150) hoặc NULL (giữ nguyên)
            request.IsActive               // bool? hoặc NULL (giữ nguyên)
        }, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<CreateMenuItemResult?> CreateMenuItemAsync(Guid menuId, CreateMenuItemRequest request, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);

        var menuExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            MenuExistsSql, new { MenuId = menuId }, cancellationToken: ct));
        if (menuExists == 0) return null;

        // Xác định hierarchy_path của parent (nếu có). Parent phải thuộc cùng menu.
        string parentPath = "/";
        if (request.ParentId is { } parentId)
        {
            var path = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
                ParentPathSql, new { ParentId = parentId, MenuId = menuId }, cancellationToken: ct));
            if (path is null) return null; // parent không tồn tại hoặc khác menu
            parentPath = path;
        }

        var newId = Guid.NewGuid();
        var hierarchyPath = $"{parentPath}{newId}/";

        var row = await conn.QuerySingleAsync<(Guid Id, Guid MenuId, Guid? ParentId, string LinkType, string? HierarchyPath, int SortOrder)>(
            new CommandDefinition(InsertMenuItemSql, new
            {
                MenuId = menuId,
                request.ParentId,
                TitleLocales = ToJsonObject(request.TitleLocales),
                LinkType = Ansi(request.LinkType, 30),
                request.TargetEntryId,
                CustomUrl = request.CustomUrl,   // NVARCHAR(500)
                request.TargetBlank,
                IconClass = Ansi(request.IconClass, 100),
                HierarchyPath = Ansi(hierarchyPath, 500),
                request.SortOrder,
                request.IsVisible
            }, cancellationToken: ct));

        return new CreateMenuItemResult(row.Id, row.MenuId, row.ParentId, row.LinkType, row.HierarchyPath, row.SortOrder);
    }

    public async Task<bool> UpdateMenuItemAsync(Guid menuId, Guid itemId, UpdateMenuItemRequest request, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);

        // titleLocales: null => giữ nguyên; có giá trị => phải là JSON object.
        string? titleJson = null;
        if (request.TitleLocales is { } tl && tl.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
        {
            if (tl.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("titleLocales phải là JSON object.");
            titleJson = tl.GetRawText();
        }

        // Kiểm tra item tồn tại trước khi làm bất cứ điều gì.
        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            MenuItemExistsSql, new { ItemId = itemId, MenuId = menuId }, cancellationToken: ct));
        if (exists == 0) return false;

        using var tx = conn.BeginTransaction();
        try
        {
            // 1) Cập nhật các trường thường (title, url, sort_order, target_blank).
            await conn.ExecuteAsync(new CommandDefinition(UpdateMenuItemSql, new
            {
                MenuId = menuId,
                ItemId = itemId,
                TitleLocales = titleJson,                 // NVARCHAR(MAX) hoặc NULL
                CustomUrl = request.CustomUrl,            // NVARCHAR(500) hoặc NULL
                request.SortOrder,                        // int? hoặc NULL
                request.TargetBlank                       // bool? hoặc NULL
            }, tx, cancellationToken: ct));

            // 2) Nếu có đổi cha (ParentId != null): tính lại parent_id + hierarchy_path cho item và toàn bộ con cháu.
            if (request.ParentId is { } newParentId)
            {
                // Guid.Empty => chuyển thành mục gốc (parent_id = NULL).
                Guid? parentId = newParentId == Guid.Empty ? null : newParentId;

                // Chặn tự làm cha của chính mình.
                if (parentId is { } selfCheck && selfCheck == itemId)
                    throw new CircularReferenceException("Không thể di chuyển mục vào chính nó (vòng lặp).");

                // Xác định path của cha mới.
                string parentPath = "/";
                if (parentId is { } pid)
                {
                    var path = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
                        ParentPathSql, new { ParentId = pid, MenuId = menuId }, tx, cancellationToken: ct));
                    if (path is null)
                        throw new ArgumentException("parentId không tồn tại hoặc không thuộc menu này.");
                    parentPath = path;

                    // Chặn di chuyển mục vào con cháu của chính nó (circular reference).
                    var isDescendant = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                        IsDescendantSql, new { ItemId = itemId, ParentId = pid, MenuId = menuId }, tx, cancellationToken: ct));
                    if (isDescendant > 0)
                        throw new CircularReferenceException("Không thể di chuyển mục vào con cháu của chính nó (vòng lặp).");
                }

                // Lấy path cũ của item để tìm con cháu.
                var oldPath = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
                    ItemPathSql, new { ItemId = itemId, MenuId = menuId }, tx, cancellationToken: ct));
                if (oldPath is null)
                    throw new ArgumentException("Không tìm thấy hierarchy_path của item.");

                var newPath = $"{parentPath}{itemId}/";

                // Cập nhật parent_id + path của chính item.
                await conn.ExecuteAsync(new CommandDefinition(UpdateMenuItemParentSql, new
                {
                    MenuId = menuId,
                    ItemId = itemId,
                    ParentId = parentId,
                    HierarchyPath = Ansi(newPath, 500)
                }, tx, cancellationToken: ct));

                // Rebuild path cho toàn bộ con cháu: thay tiền tố oldPath bằng newPath.
                var descendants = await conn.QueryAsync<(Guid Id, string HierarchyPath)>(
                    new CommandDefinition(DescendantsSql, new { MenuId = menuId, OldPrefix = oldPath, ItemId = itemId }, tx, cancellationToken: ct));

                foreach (var d in descendants)
                {
                    var rebuilt = newPath + d.HierarchyPath.Substring(oldPath.Length);
                    await conn.ExecuteAsync(new CommandDefinition(UpdateItemPathSql, new
                    {
                        ItemId = d.Id,
                        HierarchyPath = Ansi(rebuilt, 500)
                    }, tx, cancellationToken: ct));
                }
            }

            tx.Commit();
            return true;
        }
        catch
        {
            // using tx => rollback khi Dispose.
            throw;
        }
    }

    public async Task<bool> DeleteMenuAsync(Guid menuId, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);
        // cms_menu_items có FK ON DELETE CASCADE tới cms_menus => xóa menu tự xóa items.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            DeleteMenuSql, new { MenuId = menuId }, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<bool> DeleteMenuItemAsync(Guid menuId, Guid itemId, CancellationToken ct)
    {
        using var conn = await OpenAsync(ct);

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            MenuItemExistsSql, new { ItemId = itemId, MenuId = menuId }, cancellationToken: ct));
        if (exists == 0) return false;

        // Chặn xóa nếu còn mục con (FK parent_id là ON DELETE NO ACTION).
        var childCount = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            MenuItemChildCountSql, new { ItemId = itemId }, cancellationToken: ct));
        if (childCount > 0)
            throw new ArgumentException($"Menu item '{itemId}' còn {childCount} mục con. Hãy xóa mục con trước.");

        var affected = await conn.ExecuteAsync(new CommandDefinition(
            DeleteMenuItemSql, new { ItemId = itemId, MenuId = menuId }, cancellationToken: ct));
        return affected > 0;
    }

    private async Task<IDbConnection> OpenAsync(CancellationToken ct)
    {
        var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();
        return conn;
    }

    /// <summary>Serialize JsonElement thành chuỗi JSON object; null/không phải object -> "{}".</summary>
    private static string ToJsonObject(JsonElement? element)
    {
        if (element is not { } e || e.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return "{}";
        if (e.ValueKind != JsonValueKind.Object)
            throw new ArgumentException("titleLocales phải là JSON object.");
        return e.GetRawText();
    }

    private static DbString Ansi(string? value, int length) =>
        new() { Value = value ?? string.Empty, IsAnsi = true, Length = length };
}
