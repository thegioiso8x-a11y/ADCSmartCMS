using System.Data.Common;
using System.Text.Json;
using AdcSmartCms.Application.Rbac;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Milestone 5: Dynamic RBAC Engine (Dapper).
/// Luồng: cms_users -> cms_user_roles -> cms_roles (site_id NULL hoặc = @SiteId)
///        -> cms_permissions (content_type_id NULL hoặc = content type của @ContentTypeApiId).
/// Cấp 1 (Site): role bị giới hạn site_id.
/// Cấp 2 (Entity): permission gắn content_type_id.
/// Cấp 3 (Row): scope = 'own' => ownerId phải trùng userId.
/// Cấp 4 (Field): allowed_fields (JSON array) trả về cho caller lọc field.
/// </summary>
public sealed class RbacService : IRbacService
{
    private const string SelectUserSql = """
        SELECT id AS Id, is_super_admin AS IsSuperAdmin, is_active AS IsActive
        FROM dbo.cms_users
        WHERE id = @UserId;
        """;

    private const string SelectRolesSql = """
        SELECT r.role_code AS RoleCode
        FROM dbo.cms_user_roles ur
        INNER JOIN dbo.cms_roles r ON r.id = ur.role_id
        WHERE ur.user_id = @UserId
          AND (r.site_id IS NULL OR r.site_id = @SiteId)
        ORDER BY r.role_code;
        """;

    private const string SelectPermissionsSql = """
        SELECT p.id AS PermissionId, p.role_id AS RoleId, r.role_code AS RoleCode,
               p.content_type_id AS ContentTypeId, ct.api_id AS ContentTypeApiId,
               p.action AS Action, p.scope AS Scope,
               p.allowed_fields AS AllowedFields, p.conditions AS Conditions
        FROM dbo.cms_user_roles ur
        INNER JOIN dbo.cms_roles r ON r.id = ur.role_id
        INNER JOIN dbo.cms_permissions p ON p.role_id = r.id
        LEFT JOIN dbo.cms_content_types ct ON ct.id = p.content_type_id
        WHERE ur.user_id = @UserId
          AND (r.site_id IS NULL OR r.site_id = @SiteId)
          AND (p.content_type_id IS NULL OR ct.site_id IS NULL OR ct.site_id = @SiteId)
        ORDER BY r.role_code, p.action;
        """;

    // ---------- Quản lý role & gán role ----------

    private const string SelectRolesListSql = """
        SELECT id AS Id, site_id AS SiteId, role_code AS RoleCode, role_name AS RoleName, description AS Description
        FROM dbo.cms_roles
        WHERE (@SiteId IS NULL OR site_id IS NULL OR site_id = @SiteId)
        ORDER BY CASE WHEN site_id IS NULL THEN 0 ELSE 1 END, role_code;
        """;

    private const string RoleCodeExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_roles
        WHERE role_code = @RoleCode AND ((@SiteId IS NULL AND site_id IS NULL) OR site_id = @SiteId);
        """;

    private const string InsertRoleSql = """
        INSERT INTO dbo.cms_roles (site_id, role_code, role_name, description)
        OUTPUT INSERTED.id, INSERTED.site_id, INSERTED.role_code, INSERTED.role_name, INSERTED.description
        VALUES (@SiteId, @RoleCode, @RoleName, @Description);
        """;

    private const string DeleteRoleSql = "DELETE FROM dbo.cms_roles WHERE id = @RoleId;";

    private const string UserExistsSql = "SELECT COUNT(1) FROM dbo.cms_users WHERE id = @UserId;";

    private const string RoleExistsSql = "SELECT COUNT(1) FROM dbo.cms_roles WHERE id = @RoleId;";

    private const string UserRoleExistsSql = "SELECT COUNT(1) FROM dbo.cms_user_roles WHERE user_id = @UserId AND role_id = @RoleId;";

    private const string InsertUserRoleSql = "INSERT INTO dbo.cms_user_roles (user_id, role_id) VALUES (@UserId, @RoleId);";

    private const string DeleteUserRoleSql = "DELETE FROM dbo.cms_user_roles WHERE user_id = @UserId AND role_id = @RoleId;";

    private readonly IDbConnectionFactory _factory;

    public RbacService(IDbConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<string>> GetUserRolesAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<string>(new CommandDefinition(
            SelectRolesSql, new { UserId = userId, SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<PermissionDto>> GetUserPermissionsAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<PermissionDto>(new CommandDefinition(
            SelectPermissionsSql, new { UserId = userId, SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<bool> HasPermissionAsync(Guid userId, Guid siteId, string contentTypeApiId, string action, Guid? ownerId = null)
    {
        var result = await CheckAccessAsync(new AccessCheckRequest(userId, siteId, contentTypeApiId, action, ownerId), CancellationToken.None);
        return result.HasAccess;
    }

    public async Task<AccessCheckResult> CheckAccessAsync(AccessCheckRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var user = await conn.QuerySingleOrDefaultAsync<(Guid Id, bool IsSuperAdmin, bool IsActive)>(
            new CommandDefinition(SelectUserSql, new { UserId = request.UserId }, cancellationToken: ct));

        if (user.Id == Guid.Empty)
            return Deny("Không tìm thấy user.");
        if (!user.IsActive)
            return Deny("User đang bị vô hiệu hóa (is_active = 0).");
        if (user.IsSuperAdmin)
            return new AccessCheckResult(true, true, "super_admin", "all", Array.Empty<string>(), "User là super admin.");

        var action = request.Action?.Trim().ToLowerInvariant() ?? string.Empty;
        var apiId = request.ContentTypeApiId?.Trim() ?? string.Empty;

        var permissions = await conn.QueryAsync<PermissionDto>(new CommandDefinition(
            SelectPermissionsSql, new { UserId = request.UserId, SiteId = request.SiteId }, cancellationToken: ct));

        // Cấp 2 (Entity): permission gắn content type phải khớp api_id; permission không gắn content type áp dụng cho mọi loại.
        var candidates = permissions
            .Where(p => string.Equals(p.Action, action, StringComparison.OrdinalIgnoreCase))
            .Where(p => p.ContentTypeId is null || string.Equals(p.ContentTypeApiId, apiId, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (candidates.Count == 0)
            return Deny($"Không có role nào của user chứa quyền '{action}' cho content type '{apiId}'.");

        // Cấp 3 (Row-level): ưu tiên quyền scope 'all'; nếu chỉ có 'own' thì ownerId phải trùng userId.
        var allScope = candidates.FirstOrDefault(p => string.Equals(p.Scope, "all", StringComparison.OrdinalIgnoreCase));
        if (allScope is not null)
            return Allow(allScope, "Khớp quyền scope = 'all'.");

        var ownScope = candidates.FirstOrDefault(p => string.Equals(p.Scope, "own", StringComparison.OrdinalIgnoreCase));
        if (ownScope is not null)
        {
            if (request.OwnerId is { } owner && owner == request.UserId)
                return Allow(ownScope, "Khớp quyền scope = 'own' và ownerId trùng userId.");
            return Deny("Chỉ có quyền scope = 'own' nhưng ownerId không trùng userId.");
        }

        return Deny("Permission không có scope hợp lệ ('all' | 'own').");
    }

    public async Task<IReadOnlyList<RoleDto>> GetRolesAsync(Guid? siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<RoleDto>(new CommandDefinition(
            SelectRolesListSql, new { SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<RoleDto?> CreateRoleAsync(CreateRoleRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            RoleCodeExistsSql, new { RoleCode = Ansi(request.RoleCode, 50), SiteId = request.SiteId }, cancellationToken: ct));
        if (exists > 0) return null;

        return await conn.QuerySingleAsync<RoleDto>(new CommandDefinition(InsertRoleSql, new
        {
            request.SiteId,
            RoleCode = Ansi(request.RoleCode, 50),
            RoleName = request.RoleName,   // NVARCHAR(150)
            Description = request.Description   // NVARCHAR(500)
        }, cancellationToken: ct));
    }

    public async Task<bool> DeleteRoleAsync(Guid roleId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // cms_user_roles + cms_permissions có FK ON DELETE CASCADE tới cms_roles.
        var affected = await conn.ExecuteAsync(new CommandDefinition(DeleteRoleSql, new { RoleId = roleId }, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<bool> AssignRoleAsync(Guid userId, Guid roleId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var userExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(UserExistsSql, new { UserId = userId }, cancellationToken: ct));
        if (userExists == 0) return false;

        var roleExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(RoleExistsSql, new { RoleId = roleId }, cancellationToken: ct));
        if (roleExists == 0) return false;

        var already = await conn.ExecuteScalarAsync<int>(new CommandDefinition(UserRoleExistsSql, new { UserId = userId, RoleId = roleId }, cancellationToken: ct));
        if (already > 0) return true; // idempotent

        await conn.ExecuteAsync(new CommandDefinition(InsertUserRoleSql, new { UserId = userId, RoleId = roleId }, cancellationToken: ct));
        return true;
    }

    public async Task<bool> RevokeRoleAsync(Guid userId, Guid roleId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(DeleteUserRoleSql, new { UserId = userId, RoleId = roleId }, cancellationToken: ct));
        return affected > 0;
    }

    private static AccessCheckResult Allow(PermissionDto p, string reason) =>
        new(true, false, p.RoleCode, p.Scope, ParseAllowedFields(p.AllowedFields), reason);

    private static AccessCheckResult Deny(string reason) =>
        new(false, false, null, null, Array.Empty<string>(), reason);

    /// <summary>allowed_fields là JSON array (CHECK ISJSON(..., ARRAY)); null/rỗng => mọi field.</summary>
    private static IReadOnlyList<string> ParseAllowedFields(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return Array.Empty<string>();
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return Array.Empty<string>();
            return doc.RootElement.EnumerateArray()
                .Where(e => e.ValueKind == JsonValueKind.String)
                .Select(e => e.GetString()!)
                .ToList();
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }

    private static DbString Ansi(string? value, int length) =>
        new() { Value = value ?? string.Empty, IsAnsi = true, Length = length };
}
