using System.Data;
using System.Data.Common;
using System.Text.RegularExpressions;
using AdcSmartCms.Application.Themes;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Tạo entry 'page' (single) cho mỗi template page_* + gắn block (data-cms-block) vào cms_entry_blocks.
/// Idempotent: entry page đã có (site_id, content_type_id, slug) thì bỏ qua; block khớp
/// (entry_id, zone_key, component_type_id) đã có thì bỏ qua.
/// Dapper: Anonymous Object thuần (KHÔNG DbString/DynamicParameters cho cột nullable).
/// </summary>
public sealed class PageBlockSeeder : IPageBlockSeeder
{
    private static readonly Regex BlockRegex = new(@"data-cms-block=""([^""]+)""", RegexOptions.Compiled);

    private const string ThemeExistsSql = "SELECT COUNT(1) FROM dbo.cms_themes WHERE id = @ThemeId;";

    // Lấy template page_* + raw_html (fallback compiled_html) + template_key.
    private const string SelectPageTemplatesSql = """
        SELECT template_key AS TemplateKey, COALESCE(raw_html, compiled_html) AS Html
        FROM dbo.cms_theme_templates
        WHERE theme_id = @ThemeId AND template_key LIKE 'page[_]%'
        ORDER BY template_key;
        """;

    private const string FindPageContentTypeSql = """
        SELECT id FROM dbo.cms_content_types
        WHERE ((@SiteId IS NULL AND site_id IS NULL) OR site_id = @SiteId) AND api_id = 'page';
        """;

    private const string FindComponentTypeSql = """
        SELECT id FROM dbo.cms_content_types
        WHERE ((@SiteId IS NULL AND site_id IS NULL) OR site_id = @SiteId) AND api_id = @ApiId;
        """;

    private const string FindEntryBySlugSql = """
        SELECT e.id FROM dbo.cms_entries e
        INNER JOIN dbo.cms_entry_locales l ON l.entry_id = e.id AND l.locale = 'vi'
        WHERE e.site_id = @SiteId AND e.content_type_id = @ContentTypeId AND l.slug = @Slug;
        """;

    private const string InsertEntrySql = """
        INSERT INTO dbo.cms_entries (site_id, content_type_id, status, base_data)
        OUTPUT INSERTED.id
        VALUES (@SiteId, @ContentTypeId, 'draft', '{}');
        """;

    private const string InsertLocaleSql = """
        INSERT INTO dbo.cms_entry_locales (site_id, entry_id, locale, title, slug, localized_data)
        VALUES (@SiteId, @EntryId, 'vi', @Title, @Slug, '{}');
        """;

    private const string BlockExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_entry_blocks
        WHERE entry_id = @EntryId AND zone_key = @ZoneKey AND component_type_id = @ComponentTypeId;
        """;

    private const string InsertBlockSql = """
        INSERT INTO dbo.cms_entry_blocks (entry_id, locale, zone_key, component_type_id, block_data, sort_order, is_visible)
        VALUES (@EntryId, 'vi', @ZoneKey, @ComponentTypeId, '{}', @SortOrder, 1);
        """;

    private readonly IDbConnectionFactory _factory;

    public PageBlockSeeder(IDbConnectionFactory factory) => _factory = factory;

    public async Task<PageSeedResult?> SeedFromThemeAsync(Guid themeId, Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            ThemeExistsSql, new { ThemeId = themeId }, cancellationToken: ct));
        if (exists == 0) return null;

        var pageContentTypeId = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
            FindPageContentTypeSql, new { SiteId = siteId }, cancellationToken: ct));
        if (pageContentTypeId is null)
            return new PageSeedResult(0, 0, 0, 0, Array.Empty<string>()); // chưa có content type 'page'

        var templates = (await conn.QueryAsync<(string TemplateKey, string Html)>(
            new CommandDefinition(SelectPageTemplatesSql, new { ThemeId = themeId }, cancellationToken: ct))).ToList();

        int pagesCreated = 0, pagesSkipped = 0, blocksCreated = 0, blocksSkipped = 0;
        var slugs = new List<string>();

        using var tx = conn.BeginTransaction();
        try
        {
            foreach (var (templateKey, html) in templates)
            {
                // page_gioi_thieu -> gioi-thieu
                var slug = templateKey.StartsWith("page_", StringComparison.Ordinal)
                    ? templateKey["page_".Length..].Replace('_', '-')
                    : templateKey.Replace('_', '-');
                slugs.Add(slug);

                var existingEntryId = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
                    FindEntryBySlugSql, new { SiteId = siteId, ContentTypeId = pageContentTypeId.Value, Slug = slug }, tx, cancellationToken: ct));

                Guid entryId;
                if (existingEntryId is { } eid)
                {
                    entryId = eid;
                    pagesSkipped++;
                }
                else
                {
                    entryId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertEntrySql, new
                    {
                        SiteId = siteId,
                        ContentTypeId = pageContentTypeId.Value
                    }, tx, cancellationToken: ct));

                    await conn.ExecuteAsync(new CommandDefinition(InsertLocaleSql, new
                    {
                        SiteId = siteId,
                        EntryId = entryId,
                        Title = DisplayNameOf(slug),
                        Slug = slug
                    }, tx, cancellationToken: ct));
                    pagesCreated++;
                }

                // Bóc block theo thứ tự xuất hiện.
                var blockKeys = BlockRegex.Matches(html ?? string.Empty)
                    .Select(m => m.Groups[1].Value.Trim())
                    .Where(k => k.Length > 0)
                    .Distinct(StringComparer.Ordinal)
                    .ToList();

                var sortOrder = 0;
                foreach (var zoneKey in blockKeys)
                {
                    sortOrder++;
                    var componentTypeId = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
                        FindComponentTypeSql, new { SiteId = siteId, ApiId = zoneKey }, tx, cancellationToken: ct));
                    if (componentTypeId is null) continue; // block chưa có content type component -> bỏ qua

                    var blockExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                        BlockExistsSql, new { EntryId = entryId, ZoneKey = zoneKey, ComponentTypeId = componentTypeId.Value }, tx, cancellationToken: ct));
                    if (blockExists > 0) { blocksSkipped++; continue; }

                    await conn.ExecuteAsync(new CommandDefinition(InsertBlockSql, new
                    {
                        EntryId = entryId,
                        ZoneKey = zoneKey,
                        ComponentTypeId = componentTypeId.Value,
                        SortOrder = sortOrder
                    }, tx, cancellationToken: ct));
                    blocksCreated++;
                }
            }

            tx.Commit();
        }
        catch
        {
            // using tx => rollback khi Dispose.
            throw;
        }

        return new PageSeedResult(pagesCreated, pagesSkipped, blocksCreated, blocksSkipped, slugs);
    }

    /// <summary>"gioi-thieu" -> "Gioi Thieu".</summary>
    private static string DisplayNameOf(string slug)
    {
        var parts = slug.Split('-', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts.Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
    }
}
