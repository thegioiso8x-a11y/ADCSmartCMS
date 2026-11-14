using System.Text.Json;
using AdcSmartCms.Application.Menus;

namespace AdcSmartCms.Api.Endpoints;

public static class MenuEndpoints
{
    public static IEndpointRouteBuilder MapMenuEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/menus?siteId=...&menuCode=...: trả về cây menu đa cấp (sắp theo hierarchy_path).
        app.MapGet("/api/menus", async (Guid? siteId, string? menuCode, IMenuRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(menuCode))
                return Results.BadRequest(new { error = "menuCode là bắt buộc." });

            var menu = await repo.GetMenuAsync(siteId.Value, menuCode.Trim(), ct);
            if (menu is null)
                return Results.NotFound(new { error = $"Không tìm thấy menu '{menuCode}' cho site '{siteId}'." });

            var flat = await repo.GetMenuItemsAsync(menu.Id, ct);
            var tree = BuildTree(flat);
            return Results.Ok(new MenuTreeResult(menu, tree));
        }).RequireAuthorization();

        // GET /api/menus/list?siteId=...: danh sách tất cả menu của site (mới nhất trước).
        app.MapGet("/api/menus/list", async (Guid? siteId, IMenuRepository repo, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await repo.GetMenusBySiteAsync(siteId.Value, ct));
        }).RequireAuthorization();

        // POST /api/menus: tạo menu mới (code, name).
        app.MapPost("/api/menus", async (CreateMenuRequest request, IMenuRepository repo, CancellationToken ct) =>
        {
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.MenuCode))
                return Results.BadRequest(new { error = "menuCode là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.MenuName))
                return Results.BadRequest(new { error = "menuName là bắt buộc." });

            var menu = await repo.CreateMenuAsync(request, ct);
            return menu is null
                ? Results.Conflict(new { error = $"menuCode '{request.MenuCode}' đã tồn tại trong site." })
                : Results.Json(menu, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // PUT /api/menus/{menuId}: cập nhật menu gốc (menu_name, is_active).
        app.MapPut("/api/menus/{menuId:guid}", async (Guid menuId, UpdateMenuRequest request, IMenuRepository repo, CancellationToken ct) =>
        {
            var updated = await repo.UpdateMenuAsync(menuId, request, ct);
            return updated
                ? Results.Ok(new { menuId, status = "updated" })
                : Results.NotFound(new { error = "Không tìm thấy menu." });
        }).RequireAuthorization();

        // POST /api/menus/{menuId}/items: tạo menu item (parent_id, label đa ngôn ngữ, link_type, target/custom_url).
        app.MapPost("/api/menus/{menuId:guid}/items", async (Guid menuId, CreateMenuItemRequest request, IMenuRepository repo, CancellationToken ct) =>
        {
            var linkType = request.LinkType?.Trim().ToLowerInvariant();
            var allowed = new[] { "entry", "collection", "custom" };
            if (string.IsNullOrEmpty(linkType) || !allowed.Contains(linkType))
                return Results.BadRequest(new { error = $"linkType không hợp lệ. Hợp lệ: {string.Join(", ", allowed)}." });

            if (linkType is ("entry" or "collection") && request.TargetEntryId is null)
                return Results.BadRequest(new { error = "linkType 'entry'/'collection' yêu cầu targetEntryId." });
            if (linkType == "custom" && string.IsNullOrWhiteSpace(request.CustomUrl))
                return Results.BadRequest(new { error = "linkType 'custom' yêu cầu customUrl." });

            CreateMenuItemResult? result;
            try
            {
                result = await repo.CreateMenuItemAsync(menuId, request with { LinkType = linkType }, ct);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }

            return result is null
                ? Results.NotFound(new { error = $"Không tìm thấy menu '{menuId}' hoặc parentId không thuộc menu này." })
                : Results.Json(result, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // PUT /api/menus/{menuId}/items/{itemId}: cập nhật menu item (title_locales, custom_url, sort_order, target_blank).
        app.MapPut("/api/menus/{menuId:guid}/items/{itemId:guid}", async (
            Guid menuId, Guid itemId, UpdateMenuItemRequest request, IMenuRepository repo, CancellationToken ct) =>
        {
            bool updated;
            try
            {
                updated = await repo.UpdateMenuItemAsync(menuId, itemId, request, ct);
            }
            catch (CircularReferenceException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }

            return updated
                ? Results.Ok(new { itemId, status = "updated" })
                : Results.NotFound(new { error = $"Không tìm thấy menu item '{itemId}' trong menu '{menuId}'." });
        }).RequireAuthorization();

        // DELETE /api/menus/items/{itemId}: xóa 1 menu item (chặn nếu còn mục con).
        app.MapDelete("/api/menus/items/{itemId:guid}", async (Guid itemId, Guid? menuId, IMenuRepository repo, CancellationToken ct) =>
        {
            if (menuId is null || menuId == Guid.Empty)
                return Results.BadRequest(new { error = "menuId là bắt buộc." });

            bool deleted;
            try
            {
                deleted = await repo.DeleteMenuItemAsync(menuId.Value, itemId, ct);
            }
            catch (ArgumentException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }

            return deleted
                ? Results.Ok(new { itemId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy menu item '{itemId}' trong menu '{menuId}'." });
        }).RequireAuthorization();

        // DELETE /api/menus/{menuId}: xóa menu (cascade xóa items).
        app.MapDelete("/api/menus/{menuId:guid}", async (Guid menuId, IMenuRepository repo, CancellationToken ct) =>
        {
            var deleted = await repo.DeleteMenuAsync(menuId, ct);
            return deleted
                ? Results.Ok(new { menuId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy menu '{menuId}'." });
        }).RequireAuthorization();

        return app;
    }

    /// <summary>Dựng cây từ danh sách phẳng đã sắp theo hierarchy_path (parent luôn đứng trước con).</summary>
    private static List<MenuItemNode> BuildTree(IReadOnlyList<MenuItemDto> flat)
    {
        var nodes = new Dictionary<Guid, MenuItemNode>();
        var roots = new List<MenuItemNode>();

        foreach (var item in flat)
        {
            var node = new MenuItemNode
            {
                Id = item.Id,
                ParentId = item.ParentId,
                TitleLocales = ParseJson(item.TitleLocales),
                LinkType = item.LinkType,
                TargetEntryId = item.TargetEntryId,
                CustomUrl = item.CustomUrl,
                TargetBlank = item.TargetBlank,
                IconClass = item.IconClass,
                HierarchyPath = item.HierarchyPath,
                SortOrder = item.SortOrder,
                IsVisible = item.IsVisible
            };
            nodes[item.Id] = node;

            if (item.ParentId is { } pid && nodes.TryGetValue(pid, out var parent))
                parent.Children.Add(node);
            else
                roots.Add(node);
        }

        return roots;
    }

    private static JsonElement ParseJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return JsonDocument.Parse("{}").RootElement.Clone();
        try { return JsonDocument.Parse(raw).RootElement.Clone(); }
        catch (JsonException) { return JsonDocument.Parse("{}").RootElement.Clone(); }
    }
}
