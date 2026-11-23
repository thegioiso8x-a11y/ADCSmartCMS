namespace AdcSmartCms.Application.Sites;

// ---------- Site: Kích hoạt Theme (Set Active Theme) ----------
// Cập nhật cột cms_sites.active_theme_id cho 1 site. themeId null => gỡ theme (set NULL).

/// <summary>Body của PUT /api/sites/{siteId}/active-theme.</summary>
public sealed record SetActiveThemeRequest(Guid? ThemeId);

/// <summary>Kết quả cập nhật active theme.</summary>
public sealed record SetActiveThemeResult(Guid SiteId, Guid? ActiveThemeId);

public interface ISiteRepository
{
    /// <summary>
    /// Cập nhật active_theme_id cho site. themeId null => gỡ theme (set NULL).
    /// Trả null nếu site không tồn tại.
    /// </summary>
    Task<SetActiveThemeResult?> SetActiveThemeAsync(Guid siteId, Guid? themeId, CancellationToken ct);
}
