using System.Data;
using System.Data.Common;
using AdcSmartCms.Application.Sites;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Dapper repository cho Site (bảng cms_sites).
/// Hiện chỉ phục vụ tính năng "Kích hoạt Theme" (cập nhật active_theme_id).
/// Dùng Anonymous Object thuần (KHÔNG DbString/DynamicParameters cho cột nullable).
/// </summary>
public sealed class SiteRepository : ISiteRepository
{
    private const string SiteExistsSql = "SELECT COUNT(1) FROM dbo.cms_sites WHERE id = @SiteId;";

    private const string UpdateActiveThemeSql = """
        UPDATE dbo.cms_sites
        SET active_theme_id = @ThemeId
        WHERE id = @SiteId;
        """;

    private const string SelectActiveThemeSql = "SELECT active_theme_id FROM dbo.cms_sites WHERE id = @SiteId;";

    private readonly IDbConnectionFactory _factory;

    public SiteRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<SetActiveThemeResult?> SetActiveThemeAsync(Guid siteId, Guid? themeId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            SiteExistsSql, new { SiteId = siteId }, cancellationToken: ct));
        if (exists == 0) return null;

        // Anonymous object: themeId null -> Dapper tự map DBNull.Value (gỡ theme).
        await conn.ExecuteAsync(new CommandDefinition(UpdateActiveThemeSql, new
        {
            SiteId = siteId,
            ThemeId = themeId
        }, cancellationToken: ct));

        var activeThemeId = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
            SelectActiveThemeSql, new { SiteId = siteId }, cancellationToken: ct));

        return new SetActiveThemeResult(siteId, activeThemeId);
    }
}
