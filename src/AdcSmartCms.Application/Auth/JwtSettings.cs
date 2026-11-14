namespace AdcSmartCms.Application.Auth;

/// <summary>
/// Cấu hình JWT đọc từ appsettings.json (section "JwtSettings").
/// Secret phải đủ dài (>= 32 ký tự) để ký HMAC-SHA256.
/// </summary>
public sealed class JwtSettings
{
    public const string SectionName = "JwtSettings";

    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = "AdcSmartCms";
    public string Audience { get; set; } = "AdcSmartCmsClients";
    public int ExpiryMinutes { get; set; } = 120;
}
