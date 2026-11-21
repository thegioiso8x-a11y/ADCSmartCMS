using System.Data;
using System.Data.Common;
using System.Text.Json;
using System.Text.RegularExpressions;
using AdcSmartCms.Application.Themes;
using Dapper;
using HtmlAgilityPack;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Bóc tách menu từ HTML theme (layout_master) và upsert vào cms_menus + cms_menu_items.
/// Hỗ trợ đệ quy mục cha - con (2 cấp, 3 cấp...).
/// Idempotent: menu đã tồn tại (site_id, menu_code) thì bỏ qua; item khớp (menu_id, title, url) đã có thì bỏ qua.
/// Dapper: dùng Anonymous Object thuần (KHÔNG DbString/DynamicParameters cho cột nullable).
/// </summary>
public sealed class ThemeMenuSeeder : IThemeMenuSeeder
{
    private const string MenuAttr = "data-cms-menu";

    private const string SelectLayoutSql = """
        SELECT TOP 1 compiled_html
        FROM dbo.cms_theme_templates
        WHERE theme_id = @ThemeId AND template_key = 'layout_master';
        """;

    private const string ThemeExistsSql = "SELECT COUNT(1) FROM dbo.cms_themes WHERE id = @ThemeId;";

    // Dọn dẹp menu cũ của site trước khi seed lại (tránh trùng lặp khi chạy nhiều lần).
    // cms_menu_items có FK ON DELETE CASCADE tới cms_menus => xóa menu tự xóa items.
    private const string DeleteMenusSql = "DELETE FROM dbo.cms_menus WHERE site_id = @SiteId;";

    private const string InsertMenuSql = """
        INSERT INTO dbo.cms_menus (site_id, menu_code, menu_name, is_active)
        OUTPUT INSERTED.id
        VALUES (@SiteId, @MenuCode, @MenuName, 1);
        """;

    private const string ItemExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_menu_items
        WHERE menu_id = @MenuId AND title_locales = @TitleLocales
          AND ((@CustomUrl IS NULL AND custom_url IS NULL) OR custom_url = @CustomUrl);
        """;

    private const string InsertItemSql = """
        INSERT INTO dbo.cms_menu_items
            (menu_id, parent_id, title_locales, link_type, custom_url, hierarchy_path, sort_order, is_visible)
        OUTPUT INSERTED.id
        VALUES (@MenuId, @ParentId, @TitleLocales, @LinkType, @CustomUrl, @HierarchyPath, @SortOrder, 1);
        """;

    private readonly IDbConnectionFactory _factory;

    public ThemeMenuSeeder(IDbConnectionFactory factory) => _factory = factory;

    // ---------- Parse HTML ----------

    public IReadOnlyList<SeededMenu> ParseMenus(string html)
    {
        var result = new List<SeededMenu>();
        if (string.IsNullOrWhiteSpace(html)) return result;

        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var ulNodes = doc.DocumentNode.SelectNodes($"//ul[@{MenuAttr}]");
        if (ulNodes is null) return result;

        foreach (var ul in ulNodes)
        {
            var code = ul.GetAttributeValue(MenuAttr, string.Empty).Trim();
            if (code.Length == 0) continue;

            var items = new List<SeededMenuItem>();
            foreach (var li in ul.SelectNodes("./li") ?? Enumerable.Empty<HtmlNode>())
            {
                var item = ParseLi(li);
                if (item is not null) items.Add(item);
            }

            if (items.Count > 0) result.Add(new SeededMenu(code, items));
        }

        return result;
    }

    /// <summary>Bóc tách 1 thẻ &lt;li&gt; (đệ quy qua &lt;ul&gt; con).</summary>
    private static SeededMenuItem? ParseLi(HtmlNode li)
    {
        // <a> trực tiếp của <li> (không lấy <a> trong <ul> con).
        var anchor = li.SelectSingleNode("./a");
        var title = anchor?.InnerText?.Trim() ?? string.Empty;
        if (title.Length == 0) return null;

        var href = anchor?.GetAttributeValue("href", string.Empty)?.Trim();
        var (url, linkType) = MapLink(href);

        var children = new List<SeededMenuItem>();
        var subUl = li.SelectSingleNode("./ul");
        if (subUl is not null)
        {
            foreach (var childLi in subUl.SelectNodes("./li") ?? Enumerable.Empty<HtmlNode>())
            {
                var child = ParseLi(childLi);
                if (child is not null) children.Add(child);
            }
        }

        return new SeededMenuItem(title, url, linkType, children);
    }

    /// <summary>
    /// Map link tĩnh trong HTML theme -> (custom_url, link_type) cho Menu động.
    /// Quy tắc (không hardcode theo 1 theme cụ thể, dựa trên quy ước tên file):
    ///  - index.html            -> "/"            (custom)
    ///  - list-&lt;slug&gt;.html    -> "/&lt;slug&gt;"      (collection)
    ///  - detail-&lt;slug&gt;.html  -> "/&lt;slug&gt;/chi-tiet" (custom)
    ///  - page-&lt;slug&gt;.html    -> "/&lt;slug&gt;"      (custom)
    ///  - &lt;slug&gt;.html         -> "/&lt;slug&gt;"      (custom)
    ///  - http/https/#/mailto/tel -> giữ nguyên href (custom)
    ///  - rỗng                  -> null (custom)
    /// </summary>
    private static (string? Url, string LinkType) MapLink(string? href)
    {
        if (string.IsNullOrWhiteSpace(href)) return (null, "custom");

        var trimmed = href.Trim();

        // Link ngoài / anchor / mailto / tel / javascript -> giữ nguyên.
        if (
            Regex.IsMatch(trimmed, @"^(https?:)?//", RegexOptions.IgnoreCase) ||
            trimmed.StartsWith('#') ||
            Regex.IsMatch(trimmed, @"^(mailto|tel|javascript):", RegexOptions.IgnoreCase))
        {
            return (trimmed, "custom");
        }

        // Tách query/hash để giữ lại sau khi map.
        var hashIndex = trimmed.IndexOfAny(new[] { '?', '#' });
        var pathPart = hashIndex >= 0 ? trimmed[..hashIndex] : trimmed;
        var suffix = hashIndex >= 0 ? trimmed[hashIndex..] : string.Empty;

        // Chỉ map file .html; link nội bộ khác giữ nguyên.
        if (!pathPart.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
            return (trimmed, "custom");

        var fileName = pathPart.Split('/').Last().Replace(".html", string.Empty, StringComparison.OrdinalIgnoreCase);

        // index.html -> trang chủ.
        if (fileName.Equals("index", StringComparison.OrdinalIgnoreCase))
            return ($"/{suffix}", "custom");

        // list-<slug>.html -> /<slug> (collection).
        if (fileName.StartsWith("list-", StringComparison.OrdinalIgnoreCase))
        {
            var slug = fileName["list-".Length..];
            return ($"/{slug}{suffix}", "collection");
        }

        // detail-<slug>.html -> /<slug>/chi-tiet (custom).
        if (fileName.StartsWith("detail-", StringComparison.OrdinalIgnoreCase))
        {
            var slug = fileName["detail-".Length..];
            return ($"/{slug}/chi-tiet{suffix}", "custom");
        }

        // page-<slug>.html -> /<slug> (custom).
        if (fileName.StartsWith("page-", StringComparison.OrdinalIgnoreCase))
        {
            var slug = fileName["page-".Length..];
            return ($"/{slug}{suffix}", "custom");
        }

        // <slug>.html -> /<slug> (custom).
        return ($"/{fileName}{suffix}", "custom");
    }

    // ---------- Persist ----------

    public async Task<MenuSeedResult?> SeedFromThemeAsync(Guid themeId, Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            ThemeExistsSql, new { ThemeId = themeId }, cancellationToken: ct));
        if (exists == 0) return null;

        var layoutHtml = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
            SelectLayoutSql, new { ThemeId = themeId }, cancellationToken: ct));
        if (string.IsNullOrWhiteSpace(layoutHtml))
            return new MenuSeedResult(0, 0, 0, 0, Array.Empty<string>());

        var menus = ParseMenus(layoutHtml);
        if (menus.Count == 0)
            return new MenuSeedResult(0, 0, 0, 0, Array.Empty<string>());

        int menusCreated = 0, menusSkipped = 0, itemsCreated = 0, itemsSkipped = 0;
        var codes = new List<string>();

        using var tx = conn.BeginTransaction();
        try
        {
            // Phần 1: Dọn dẹp menu cũ của site (tránh trùng lặp khi chạy lại nhiều lần).
            // Xóa toàn bộ menu của site; cms_menu_items xóa theo CASCADE.
            await conn.ExecuteAsync(new CommandDefinition(
                DeleteMenusSql, new { SiteId = siteId }, tx, cancellationToken: ct));

            foreach (var menu in menus)
            {
                codes.Add(menu.MenuCode);

                // Sau khi dọn dẹp, menu luôn được tạo mới.
                var menuId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertMenuSql, new
                {
                    SiteId = siteId,
                    MenuCode = menu.MenuCode,
                    MenuName = DisplayNameOf(menu.MenuCode)
                }, tx, cancellationToken: ct));
                menusCreated++;

                // Upsert đệ quy các mục menu.
                await UpsertItemsAsync(conn, tx, menuId, menu.Items, parentId: null, parentPath: "/", ct,
                    onCreated: () => itemsCreated++, onSkipped: () => itemsSkipped++);
            }

            tx.Commit();
        }
        catch
        {
            // using tx => rollback khi Dispose.
            throw;
        }

        return new MenuSeedResult(menusCreated, menusSkipped, itemsCreated, itemsSkipped, codes);
    }

    private static async Task UpsertItemsAsync(
        IDbConnection conn,
        IDbTransaction tx,
        Guid menuId,
        IReadOnlyList<SeededMenuItem> items,
        Guid? parentId,
        string parentPath,
        CancellationToken ct,
        Action onCreated,
        Action onSkipped)
    {
        var sortOrder = 0;
        foreach (var item in items)
        {
            sortOrder++;

            var titleLocales = JsonSerializer.Serialize(new Dictionary<string, string> { ["vi"] = item.Title });
            var linkType = string.IsNullOrWhiteSpace(item.LinkType) ? "custom" : item.LinkType;

            var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(ItemExistsSql, new
            {
                MenuId = menuId,
                TitleLocales = titleLocales,
                CustomUrl = item.Url   // string? -> Dapper tự map null -> DBNull.Value
            }, tx, cancellationToken: ct));

            Guid itemId;
            if (exists > 0)
            {
                // Đã có: lấy id để tiếp tục xử lý con (nếu cần). Bỏ qua insert.
                itemId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(
                    "SELECT TOP 1 id FROM dbo.cms_menu_items WHERE menu_id = @MenuId AND title_locales = @TitleLocales AND ((@CustomUrl IS NULL AND custom_url IS NULL) OR custom_url = @CustomUrl);",
                    new { MenuId = menuId, TitleLocales = titleLocales, CustomUrl = item.Url }, tx, cancellationToken: ct));
                onSkipped();
            }
            else
            {
                var newId = Guid.NewGuid();
                var hierarchyPath = $"{parentPath}{newId}/";

                itemId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertItemSql, new
                {
                    MenuId = menuId,
                    ParentId = parentId,          // Guid? -> Dapper tự map null -> DBNull.Value
                    TitleLocales = titleLocales,
                    LinkType = linkType,
                    CustomUrl = item.Url,         // string? -> DBNull.Value nếu null
                    HierarchyPath = hierarchyPath,
                    SortOrder = sortOrder
                }, tx, cancellationToken: ct));
                onCreated();
            }

            if (item.Children.Count > 0)
            {
                var childPath = $"{parentPath}{itemId}/";
                await UpsertItemsAsync(conn, tx, menuId, item.Children, itemId, childPath, ct, onCreated, onSkipped);
            }
        }
    }

    /// <summary>"primary_menu" -> "Primary Menu".</summary>
    private static string DisplayNameOf(string menuCode)
    {
        var parts = menuCode.Split('_', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts.Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
    }
}
