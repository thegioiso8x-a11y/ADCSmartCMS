using AdcSmartCms.Application.Rbac;

namespace AdcSmartCms.Api.Endpoints;

public static class RbacEndpoints
{
    public static IEndpointRouteBuilder MapRbacEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/rbac/check: kiểm tra quyền 4 cấp (Site, Entity, Row, Field).
        app.MapPost("/api/rbac/check", async (AccessCheckRequest request, IRbacService rbac, CancellationToken ct) =>
        {
            if (request.UserId == Guid.Empty)
                return Results.BadRequest(new { error = "userId là bắt buộc." });
            if (request.SiteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.ContentTypeApiId))
                return Results.BadRequest(new { error = "contentTypeApiId là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.Action))
                return Results.BadRequest(new { error = "action là bắt buộc." });

            var result = await rbac.CheckAccessAsync(request, ct);
            return Results.Ok(new
            {
                hasAccess = result.HasAccess,
                isSuperAdmin = result.IsSuperAdmin,
                matchedRoleCode = result.MatchedRoleCode,
                matchedScope = result.MatchedScope,
                allowedFields = result.AllowedFields,
                reason = result.Reason
            });
        });

        // GET /api/rbac/users/{userId}/roles?siteId=...: danh sách role_code của user trong site.
        app.MapGet("/api/rbac/users/{userId:guid}/roles", async (Guid userId, Guid? siteId, IRbacService rbac, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(new { userId, siteId, roles = await rbac.GetUserRolesAsync(userId, siteId.Value, ct) });
        });

        // GET /api/rbac/users/{userId}/permissions?siteId=...: danh sách permission chi tiết của user.
        app.MapGet("/api/rbac/users/{userId:guid}/permissions", async (Guid userId, Guid? siteId, IRbacService rbac, CancellationToken ct) =>
        {
            if (siteId is null || siteId == Guid.Empty)
                return Results.BadRequest(new { error = "siteId là bắt buộc." });

            return Results.Ok(await rbac.GetUserPermissionsAsync(userId, siteId.Value, ct));
        });

        // ---------- Quản lý role & gán role ----------

        // GET /api/rbac/roles?siteId=...: danh sách role (toàn hệ thống + của site).
        app.MapGet("/api/rbac/roles", async (Guid? siteId, IRbacService rbac, CancellationToken ct) =>
            Results.Ok(await rbac.GetRolesAsync(siteId, ct))).RequireAuthorization();

        // POST /api/rbac/roles: tạo role mới.
        app.MapPost("/api/rbac/roles", async (CreateRoleRequest request, IRbacService rbac, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.RoleCode))
                return Results.BadRequest(new { error = "roleCode là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.RoleName))
                return Results.BadRequest(new { error = "roleName là bắt buộc." });

            var created = await rbac.CreateRoleAsync(request, ct);
            return created is null
                ? Results.Conflict(new { error = $"roleCode '{request.RoleCode}' đã tồn tại." })
                : Results.Json(created, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // DELETE /api/rbac/roles/{roleId}: xóa role (cascade user_roles + permissions).
        app.MapDelete("/api/rbac/roles/{roleId:guid}", async (Guid roleId, IRbacService rbac, CancellationToken ct) =>
        {
            var deleted = await rbac.DeleteRoleAsync(roleId, ct);
            return deleted
                ? Results.Ok(new { roleId, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy role '{roleId}'." });
        }).RequireAuthorization();

        // POST /api/rbac/users/{userId}/roles: gán role cho user (body: { roleId }).
        app.MapPost("/api/rbac/users/{userId:guid}/roles", async (Guid userId, AssignRoleRequest request, IRbacService rbac, CancellationToken ct) =>
        {
            if (request.RoleId == Guid.Empty)
                return Results.BadRequest(new { error = "roleId là bắt buộc." });

            var ok = await rbac.AssignRoleAsync(userId, request.RoleId, ct);
            return ok
                ? Results.Ok(new { userId, roleId = request.RoleId, status = "assigned" })
                : Results.NotFound(new { error = $"Không tìm thấy user '{userId}' hoặc role '{request.RoleId}'." });
        }).RequireAuthorization();

        // DELETE /api/rbac/users/{userId}/roles/{roleId}: thu hồi role khỏi user.
        app.MapDelete("/api/rbac/users/{userId:guid}/roles/{roleId:guid}", async (Guid userId, Guid roleId, IRbacService rbac, CancellationToken ct) =>
        {
            var revoked = await rbac.RevokeRoleAsync(userId, roleId, ct);
            return revoked
                ? Results.Ok(new { userId, roleId, status = "revoked" })
                : Results.NotFound(new { error = $"User '{userId}' chưa được gán role '{roleId}'." });
        }).RequireAuthorization();

        return app;
    }
}
