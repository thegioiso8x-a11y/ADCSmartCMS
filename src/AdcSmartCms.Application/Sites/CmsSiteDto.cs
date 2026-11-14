namespace AdcSmartCms.Application.Sites;

/// <summary>
/// DTO trả ra API. Cố ý khác Entity: bỏ SiteSettings/AdditionalDomains (thô),
/// đổi tên SupportedLocales -> mảng, để chứng minh Mapster map có cấu hình (xem CmsSiteMappingConfig).
/// </summary>
public class CmsSiteDto
{
    public Guid Id { get; set; }
    public string SiteCode { get; set; } = default!;
    public string SiteName { get; set; } = default!;
    public string PrimaryDomain { get; set; } = default!;
    public string DefaultLocale { get; set; } = default!;
    public string[] SupportedLocales { get; set; } = [];
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
