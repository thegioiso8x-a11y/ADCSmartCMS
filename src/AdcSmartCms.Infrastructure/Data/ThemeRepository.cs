using System.Data;
using System.Data.Common;
using AdcSmartCms.Application.Themes;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Dapper. Bám DDL thật trong data_SmartCMS.sql:
///  cms_themes: UQ_cms_themes_code (theme_code), CK ISJSON(theme_variables, OBJECT)
///  cms_theme_templates: FK_templates_theme, UQ_theme_template_key (theme_id, template_key), CK ISJSON(extracted_schema, OBJECT)
/// Các cột không truyền (thumbnail_url, theme_variables, id, created_at, updated_at) dùng DEFAULT của DB.
/// </summary>
public sealed class ThemeRepository : IThemeRepository
{
    private const string InsertThemeSql = """
        INSERT INTO dbo.cms_themes (theme_code, theme_name, version, assets_base_url)
        OUTPUT INSERTED.id
        VALUES (@ThemeCode, @ThemeName, @Version, @AssetsBaseUrl);
        """;

    private const string InsertTemplateSql = """
        INSERT INTO dbo.cms_theme_templates (theme_id, template_key, template_type, compiled_html, extracted_schema)
        OUTPUT INSERTED.id
        VALUES (@ThemeId, @TemplateKey, @TemplateType, @CompiledHtml, @ExtractedSchema);
        """;

    private const string SelectThemesSql = """
        SELECT id AS Id, theme_code AS ThemeCode, theme_name AS ThemeName, version AS Version,
               assets_base_url AS AssetsBaseUrl, thumbnail_url AS ThumbnailUrl,
               theme_variables AS ThemeVariables, created_at AS CreatedAt
        FROM dbo.cms_themes
        ORDER BY created_at DESC;
        """;

    private const string SelectThemeByIdSql = """
        SELECT id AS Id, theme_code AS ThemeCode, theme_name AS ThemeName, version AS Version,
               assets_base_url AS AssetsBaseUrl, thumbnail_url AS ThumbnailUrl,
               theme_variables AS ThemeVariables, created_at AS CreatedAt
        FROM dbo.cms_themes
        WHERE id = @ThemeId;
        """;

    private const string UpdateThemeVariablesSql = """
        UPDATE dbo.cms_themes
        SET theme_variables = @ThemeVariables
        WHERE id = @ThemeId;
        """;

    private const string SelectTemplatesSql = """
        SELECT id AS Id, template_key AS TemplateKey, template_type AS TemplateType,
               compiled_html AS CompiledHtml, extracted_schema AS ExtractedSchema,
               updated_at AS UpdatedAt
        FROM dbo.cms_theme_templates
        WHERE theme_id = @ThemeId
        ORDER BY template_key;
        """;

    private readonly IDbConnectionFactory _factory;

    public ThemeRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<ThemeCreated?> CreateAsync(
        ThemeInsert theme, IReadOnlyList<ThemeTemplateInsert> templates, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();
        using var tx = conn.BeginTransaction();

        try
        {
            // Cột VARCHAR phải truyền DbString(IsAnsi) để tránh chuyển đổi ngầm nvarchar.
            var themeId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertThemeSql, new
            {
                ThemeCode = Ansi(theme.ThemeCode, 100),
                theme.ThemeName,                      // NVARCHAR(150)
                Version = Ansi(theme.Version, 20),
                AssetsBaseUrl = Ansi(theme.AssetsBaseUrl, 500)
            }, tx, cancellationToken: ct));

            var templateIds = new List<Guid>(templates.Count);
            foreach (var t in templates)
            {
                templateIds.Add(await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertTemplateSql, new
                {
                    ThemeId = themeId,
                    TemplateKey = Ansi(t.TemplateKey, 100),
                    TemplateType = Ansi(t.TemplateType, 30),
                    CompiledHtml = t.CompiledHtml,           // NVARCHAR(MAX) (Dapper tự chọn -1 khi > 4000)
                    ExtractedSchema = t.ExtractedSchemaJson  // NVARCHAR(MAX)
                }, tx, cancellationToken: ct)));
            }

            tx.Commit();
            return new ThemeCreated(themeId, templateIds);
        }
        catch (SqlException ex) when (ex.Number is 2627 or 2601 && ex.Message.Contains("UQ_cms_themes_code", StringComparison.Ordinal))
        {
            return null; // using tx => rollback khi Dispose
        }
    }

    public async Task<IReadOnlyList<ThemeListItemDto>> GetThemesAsync(CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<ThemeListItemDto>(new CommandDefinition(
            SelectThemesSql, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<ThemeListItemDto?> UpdateThemeVariablesAsync(Guid themeId, string themeVariablesJson, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Anonymous object: Dapper tự map null -> DBNull.Value (không dùng DbString cho cột nullable).
        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateThemeVariablesSql, new
        {
            ThemeId = themeId,
            ThemeVariables = themeVariablesJson   // NVARCHAR(MAX) JSON object
        }, cancellationToken: ct));

        if (affected == 0) return null;

        return await conn.QuerySingleOrDefaultAsync<ThemeListItemDto>(new CommandDefinition(
            SelectThemeByIdSql, new { ThemeId = themeId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<ThemeTemplateDto>> GetTemplatesAsync(Guid themeId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<ThemeTemplateDto>(new CommandDefinition(
            SelectTemplatesSql, new { ThemeId = themeId }, cancellationToken: ct));
        return rows.ToList();
    }

    private static DbString Ansi(string value, int length) =>
        new() { Value = value, IsAnsi = true, Length = length };
}
