namespace AdcSmartCms.Application.Rbac;

// ---------- Milestone 5: Dynamic RBAC Engine (4 cấp: Site, Entity, Row, Field) ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_users: id, email, full_name, is_super_admin, is_active
//  cms_roles: id, site_id (NULL = toàn hệ thống), role_code, role_name
//  cms_user_roles: user_id, role_id
//  cms_permissions: role_id, content_type_id (NULL = mọi content type), action VARCHAR(50),
//                   scope VARCHAR(30) ('all' | 'own'), allowed_fields NVARCHAR(MAX) JSON ARRAY, conditions JSON OBJECT
//  cms_content_types: id, site_id (NULL = dùng chung), api_id

/// <summary>Một dòng quyền (bảng cms_permissions) kèm thông tin role.</summary>
public sealed class PermissionDto
{
    public Guid PermissionId { get; set; }
    public Guid RoleId { get; set; }
    public string RoleCode { get; set; } = string.Empty;
    public Guid? ContentTypeId { get; set; }
    public string? ContentTypeApiId { get; set; }   // NULL = áp dụng cho mọi content type
    public string Action { get; set; } = string.Empty;
    public string Scope { get; set; } = "all";      // 'all' | 'own'
    public string? AllowedFields { get; set; }      // JSON array string (raw)
    public string? Conditions { get; set; }         // JSON object string (raw)
}

/// <summary>Body của POST /api/rbac/check.</summary>
public sealed record AccessCheckRequest(
    Guid UserId,
    Guid SiteId,
    string ContentTypeApiId,
    string Action,
    Guid? OwnerId = null);

/// <summary>Kết quả kiểm tra quyền chi tiết (dùng nội bộ + trả về cho API test).</summary>
public sealed record AccessCheckResult(
    bool HasAccess,
    bool IsSuperAdmin,
    string? MatchedRoleCode,
    string? MatchedScope,
    IReadOnlyList<string> AllowedFields,
    string Reason);

/// <summary>Một role (bảng cms_roles).</summary>
public sealed class RoleDto
{
    public Guid Id { get; set; }
    public Guid? SiteId { get; set; }   // NULL = role toàn hệ thống
    public string RoleCode { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public string? Description { get; set; }
}

/// <summary>Body của POST /api/rbac/roles.</summary>
public sealed record CreateRoleRequest(
    Guid? SiteId,
    string RoleCode,
    string RoleName,
    string? Description = null);

/// <summary>Body của POST /api/rbac/users/{userId}/roles.</summary>
public sealed record AssignRoleRequest(Guid RoleId);

public interface IRbacService
{
    /// <summary>Danh sách role_code của user (chỉ role toàn hệ thống hoặc role thuộc site đang xét).</summary>
    Task<IReadOnlyList<string>> GetUserRolesAsync(Guid userId, Guid siteId, CancellationToken ct);

    /// <summary>Danh sách permission của user trong phạm vi site (đã join role + content type).</summary>
    Task<IReadOnlyList<PermissionDto>> GetUserPermissionsAsync(Guid userId, Guid siteId, CancellationToken ct);

    /// <summary>
    /// Kiểm tra quyền 4 cấp. Trả true nếu user có role chứa quyền (action + content type) thỏa mãn:
    ///  - scope = 'all'  => luôn true;
    ///  - scope = 'own'  => chỉ true khi ownerId có giá trị và trùng userId (Row-level).
    /// Super admin luôn true.
    /// </summary>
    Task<bool> HasPermissionAsync(Guid userId, Guid siteId, string contentTypeApiId, string action, Guid? ownerId = null);

    /// <summary>Như HasPermissionAsync nhưng trả về chi tiết (role khớp, scope, allowed_fields, lý do).</summary>
    Task<AccessCheckResult> CheckAccessAsync(AccessCheckRequest request, CancellationToken ct);

    /// <summary>Danh sách role (toàn hệ thống + của site nếu có siteId).</summary>
    Task<IReadOnlyList<RoleDto>> GetRolesAsync(Guid? siteId, CancellationToken ct);

    /// <summary>Tạo role; trả null nếu (site_id, role_code) đã tồn tại.</summary>
    Task<RoleDto?> CreateRoleAsync(CreateRoleRequest request, CancellationToken ct);

    /// <summary>Xóa role (cascade xóa user_roles + permissions). Trả false nếu không tồn tại.</summary>
    Task<bool> DeleteRoleAsync(Guid roleId, CancellationToken ct);

    /// <summary>Gán role cho user; trả false nếu user/role không tồn tại. Idempotent (đã gán thì bỏ qua).</summary>
    Task<bool> AssignRoleAsync(Guid userId, Guid roleId, CancellationToken ct);

    /// <summary>Thu hồi role khỏi user; trả false nếu chưa được gán.</summary>
    Task<bool> RevokeRoleAsync(Guid userId, Guid roleId, CancellationToken ct);
}
