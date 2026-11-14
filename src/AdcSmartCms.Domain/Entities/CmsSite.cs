namespace AdcSmartCms.Domain.Entities;

/// <summary>
/// Map 1-1 với bảng dbo.cms_sites (đã verify bằng sys.columns ở Bước 4.0).
/// </summary>
public class CmsSite
{
    public Guid Id { get; set; }                          // id uniqueidentifier NOT NULL
    public string SiteCode { get; set; } = default!;      // site_code varchar(50) NOT NULL
    public string SiteName { get; set; } = default!;      // site_name nvarchar(150) NOT NULL
    public string PrimaryDomain { get; set; } = default!; // primary_domain varchar(255) NOT NULL
    public string? AdditionalDomains { get; set; }        // additional_domains nvarchar(max) NULL
    public Guid? ActiveThemeId { get; set; }              // active_theme_id uniqueidentifier NULL
    public string DefaultLocale { get; set; } = "vi";     // default_locale varchar(10) NOT NULL
    public string SupportedLocales { get; set; } = "vi";  // supported_locales varchar(100) NOT NULL
    public string SiteSettings { get; set; } = "{}";      // site_settings nvarchar(max) NOT NULL (JSON)
    public bool IsActive { get; set; } = true;            // is_active bit NOT NULL
    public DateTimeOffset CreatedAt { get; set; }         // created_at datetimeoffset NOT NULL
}
