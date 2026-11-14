namespace AdcSmartCms.Application.Auth;

// ---------- Milestone 8: JWT Authentication & Security ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_users: id, email VARCHAR(255) UNIQUE, password_hash VARCHAR(500), full_name NVARCHAR(150),
//             avatar_url, is_super_admin BIT, is_active BIT, last_login_at, created_at

/// <summary>User rút gọn dùng cho xác thực + sinh JWT (không chứa password_hash).</summary>
public sealed class AuthUserDto
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public bool IsSuperAdmin { get; set; }
    public bool IsActive { get; set; }
}

/// <summary>Body của POST /api/auth/login.</summary>
public sealed record LoginRequest(string Email, string Password);

/// <summary>Body của POST /api/auth/register (dùng để test).</summary>
public sealed record RegisterRequest(string Email, string Password, string FullName);

/// <summary>Kết quả đăng nhập: JWT + thông tin user + thời điểm hết hạn.</summary>
public sealed record LoginResult(
    string AccessToken,
    string TokenType,
    int ExpiresInMinutes,
    DateTimeOffset ExpiresAt,
    AuthUserDto User);

/// <summary>Kết quả đăng ký (không trả password_hash).</summary>
public sealed record RegisterResult(Guid Id, string Email, string FullName, bool IsSuperAdmin);

public interface IAuthService
{
    /// <summary>Hash mật khẩu bằng BCrypt (kèm salt tự sinh).</summary>
    string HashPassword(string password);

    /// <summary>So khớp mật khẩu thô với hash BCrypt đã lưu.</summary>
    bool VerifyPassword(string password, string hash);

    /// <summary>Sinh JWT chứa claim: Id, Email, Role, is_super_admin.</summary>
    string GenerateJwtToken(AuthUserDto user);

    /// <summary>Đăng nhập: kiểm tra email/password trong cms_users, trả null nếu sai/không active.</summary>
    Task<LoginResult?> LoginAsync(LoginRequest request, CancellationToken ct);

    /// <summary>Đăng ký user mới (hash password). Trả null nếu email đã tồn tại.</summary>
    Task<RegisterResult?> RegisterAsync(RegisterRequest request, CancellationToken ct);
}
