using System.Data.Common;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AdcSmartCms.Application.Auth;
using AdcSmartCms.Infrastructure.Data;
using Dapper;
using Microsoft.IdentityModel.Tokens;

namespace AdcSmartCms.Infrastructure.Auth;

/// <summary>
/// Milestone 8: AuthService (Dapper + BCrypt + JWT).
/// Luồng đăng nhập: cms_users (email) -> VerifyPassword (BCrypt) -> cập nhật last_login_at -> sinh JWT.
/// Claim trong token: Id (NameIdentifier), Email, Role, is_super_admin.
/// </summary>
public sealed class AuthService : IAuthService
{
    private const string SelectUserByEmailSql = """
        SELECT id AS Id, email AS Email, password_hash AS PasswordHash, full_name AS FullName,
               avatar_url AS AvatarUrl, is_super_admin AS IsSuperAdmin, is_active AS IsActive
        FROM dbo.cms_users
        WHERE email = @Email;
        """;

    private const string InsertUserSql = """
        INSERT INTO dbo.cms_users (email, password_hash, full_name, is_super_admin, is_active)
        OUTPUT INSERTED.id AS Id, INSERTED.email AS Email, INSERTED.full_name AS FullName,
               INSERTED.is_super_admin AS IsSuperAdmin
        VALUES (@Email, @PasswordHash, @FullName, 0, 1);
        """;

    private const string UpdateLastLoginSql = """
        UPDATE dbo.cms_users SET last_login_at = SYSDATETIMEOFFSET() WHERE id = @Id;
        """;

    private readonly IDbConnectionFactory _factory;
    private readonly JwtSettings _jwt;

    public AuthService(IDbConnectionFactory factory, JwtSettings jwt)
    {
        _factory = factory;
        _jwt = jwt;
    }

    public string HashPassword(string password) => BCrypt.Net.BCrypt.HashPassword(password);

    public bool VerifyPassword(string password, string hash)
    {
        if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(hash)) return false;
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            // Hash lưu trong DB không đúng định dạng BCrypt -> coi như sai.
            return false;
        }
    }

    public string GenerateJwtToken(AuthUserDto user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // Role: super admin -> "super_admin", còn lại "user" (RBAC chi tiết vẫn kiểm tra qua cms_permissions).
        var role = user.IsSuperAdmin ? "super_admin" : "user";

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, role),
            new("is_super_admin", user.IsSuperAdmin ? "true" : "false")
        };

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddMinutes(_jwt.ExpiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public async Task<LoginResult?> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim() ?? string.Empty;
        if (email.Length == 0 || string.IsNullOrEmpty(request.Password)) return null;

        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var row = await conn.QuerySingleOrDefaultAsync<UserRow>(new CommandDefinition(
            SelectUserByEmailSql, new { Email = email }, cancellationToken: ct));

        if (row is null || !row.IsActive) return null;
        if (!VerifyPassword(request.Password, row.PasswordHash)) return null;

        await conn.ExecuteAsync(new CommandDefinition(
            UpdateLastLoginSql, new { row.Id }, cancellationToken: ct));

        var user = new AuthUserDto
        {
            Id = row.Id,
            Email = row.Email,
            FullName = row.FullName,
            AvatarUrl = row.AvatarUrl,
            IsSuperAdmin = row.IsSuperAdmin,
            IsActive = row.IsActive
        };

        var token = GenerateJwtToken(user);
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(_jwt.ExpiryMinutes);
        return new LoginResult(token, "Bearer", _jwt.ExpiryMinutes, expiresAt, user);
    }

    public async Task<RegisterResult?> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim() ?? string.Empty;
        var fullName = request.FullName?.Trim() ?? string.Empty;
        if (email.Length == 0 || string.IsNullOrEmpty(request.Password) || fullName.Length == 0) return null;

        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Email đã tồn tại (UQ_cms_users_email) -> trả null để endpoint trả 409.
        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM dbo.cms_users WHERE email = @Email;",
            new { Email = email }, cancellationToken: ct));
        if (exists > 0) return null;

        var passwordHash = HashPassword(request.Password);

        try
        {
            var inserted = await conn.QuerySingleAsync<RegisterResult>(new CommandDefinition(
                InsertUserSql,
                new { Email = email, PasswordHash = passwordHash, FullName = fullName },
                cancellationToken: ct));
            return inserted;
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number is 2601 or 2627)
        {
            // Race condition: email vừa được tạo bởi request khác.
            return null;
        }
    }

    /// <summary>Dòng đọc từ cms_users (kèm password_hash để verify).</summary>
    private sealed class UserRow
    {
        public Guid Id { get; set; }
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public bool IsSuperAdmin { get; set; }
        public bool IsActive { get; set; }
    }
}
