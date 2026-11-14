using System.Data;
using System.Data.Common;
using System.Text.Json;
using AdcSmartCms.Application.Themes;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Bước 1.5: Auto-Schema Generator.
/// Nguồn dữ liệu: cột cms_theme_templates.extracted_schema (JSON do Parser sinh ra ở Bước 1.2/1.4).
/// Quy tắc gộp (theo quyết định kiến trúc #1: Parser giữ raw, Auto-Schema gộp trùng):
///  - Gom trường theo khóa nhóm: ưu tiên data-cms-collection / data-cms-block trên chính thẻ field
///    (nếu Parser tương lai gắn kèm), ngược lại dùng template_key của template chứa trường đó.
///  - Trong 1 nhóm, mỗi field_key chỉ giữ 1 định nghĩa (lần xuất hiện đầu tiên).
///  - kind: collection -> 'collection', block -> 'component', còn lại -> 'single'.
/// Idempotent: content type khớp (site_id IS NULL, api_id) đã có thì bỏ qua; field khớp
/// (content_type_id, field_key) đã có thì bỏ qua.
/// </summary>
public sealed class AutoSchemaGenerator : IAutoSchemaGenerator
{
    // 14 kiểu hợp lệ theo DDL cms_field_definitions.field_type + linter (ZipThemeLinter.ValidFieldTypes).
    private static readonly HashSet<string> ValidFieldTypes = new(StringComparer.Ordinal)
    {
        "string", "text", "rich_text", "integer", "decimal", "boolean", "datetime",
        "enumeration", "multi_select", "media", "relation", "repeater", "dynamic_zone", "json"
    };

    private const string SelectTemplatesSql = """
        SELECT template_key, extracted_schema
        FROM dbo.cms_theme_templates
        WHERE theme_id = @ThemeId
        ORDER BY template_key;
        """;

    private const string ThemeExistsSql = "SELECT COUNT(1) FROM dbo.cms_themes WHERE id = @ThemeId;";

    private const string FindContentTypeSql = """
        SELECT id FROM dbo.cms_content_types
        WHERE site_id IS NULL AND api_id = @ApiId;
        """;

    private const string InsertContentTypeSql = """
        INSERT INTO dbo.cms_content_types (site_id, api_id, display_name, kind)
        OUTPUT INSERTED.id
        VALUES (NULL, @ApiId, @DisplayName, @Kind);
        """;

    private const string FieldExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_field_definitions
        WHERE content_type_id = @ContentTypeId AND field_key = @FieldKey;
        """;

    private const string InsertFieldSql = """
        INSERT INTO dbo.cms_field_definitions
            (content_type_id, field_key, display_label, field_type, sort_order)
        VALUES (@ContentTypeId, @FieldKey, @DisplayLabel, @FieldType, @SortOrder);
        """;

    private readonly IDbConnectionFactory _factory;

    public AutoSchemaGenerator(IDbConnectionFactory factory) => _factory = factory;

    // ---------- Đọc & dựng mô hình ----------

    public async Task<AutoSchemaResult?> GenerateAsync(Guid themeId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(ThemeExistsSql, new { ThemeId = themeId }, cancellationToken: ct));
        if (exists == 0) return null;

        var templates = (await conn.QueryAsync<(string TemplateKey, string ExtractedSchema)>(
            new CommandDefinition(SelectTemplatesSql, new { ThemeId = themeId }, cancellationToken: ct))).ToList();

        var warnings = new List<string>();
        // api_id -> (kind, displayName, fields theo thứ tự xuất hiện, đã dedupe field_key)
        var groups = new Dictionary<string, GroupBuilder>(StringComparer.Ordinal);

        foreach (var (templateKey, schemaJson) in templates)
        {
            ParsedHtmlResult? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<ParsedHtmlResult>(schemaJson, JsonOptions);
            }
            catch (JsonException ex)
            {
                warnings.Add($"Template '{templateKey}': extracted_schema không đọc được ({ex.Message}). Bỏ qua.");
                continue;
            }
            if (parsed is null) continue;

            foreach (var field in parsed.Fields)
            {
                var (apiId, kind) = ResolveGroup(field, templateKey);
                if (!groups.TryGetValue(apiId, out var g))
                {
                    g = new GroupBuilder(apiId, kind, DisplayNameOf(apiId));
                    groups[apiId] = g;
                }

                var fieldType = NormalizeFieldType(field.FieldType, templateKey, field.FieldKey, warnings);
                g.AddField(field.FieldKey, fieldType);
            }
        }

        var contentTypes = groups.Values
            .Select(g => new GeneratedContentType(g.ApiId, g.DisplayName, g.Kind, g.BuildFields()))
            .ToList();

        return new AutoSchemaResult(themeId, templates.Count, contentTypes, warnings);
    }

    // ---------- Ghi DB ----------

    public async Task<AutoSchemaPersistResult?> PersistAsync(Guid themeId, CancellationToken ct)
    {
        var model = await GenerateAsync(themeId, ct);
        if (model is null) return null;

        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();
        using var tx = conn.BeginTransaction();

        int ctInserted = 0, ctSkipped = 0, fInserted = 0, fSkipped = 0;
        var ctIds = new List<Guid>();

        foreach (var contentType in model.ContentTypes)
        {
            var existingId = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
                FindContentTypeSql, new { contentType.ApiId }, tx, cancellationToken: ct));

            Guid contentTypeId;
            if (existingId is { } id)
            {
                contentTypeId = id;
                ctSkipped++;
            }
            else
            {
                contentTypeId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertContentTypeSql, new
                {
                    ApiId = Ansi(contentType.ApiId, 100),
                    DisplayName = contentType.DisplayName,   // NVARCHAR(150)
                    Kind = Ansi(contentType.Kind, 30)
                }, tx, cancellationToken: ct));
                ctInserted++;
            }
            ctIds.Add(contentTypeId);

            foreach (var f in contentType.Fields)
            {
                var fieldExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                    FieldExistsSql, new { ContentTypeId = contentTypeId, FieldKey = Ansi(f.FieldKey, 100) }, tx, cancellationToken: ct));
                if (fieldExists > 0) { fSkipped++; continue; }

                await conn.ExecuteAsync(new CommandDefinition(InsertFieldSql, new
                {
                    ContentTypeId = contentTypeId,
                    FieldKey = Ansi(f.FieldKey, 100),
                    DisplayLabel = f.DisplayLabel,   // NVARCHAR(150)
                    FieldType = Ansi(f.FieldType, 50),
                    f.SortOrder
                }, tx, cancellationToken: ct));
                fInserted++;
            }
        }

        tx.Commit();
        return new AutoSchemaPersistResult(ctInserted, ctSkipped, fInserted, fSkipped, ctIds);
    }

    // ---------- Tiện ích ----------

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Xác định content type chứa field: ưu tiên data-cms-collection/block trên thẻ, ngược lại theo template.</summary>
    private static (string ApiId, string Kind) ResolveGroup(ParsedField field, string templateKey)
    {
        if (field.CmsAttributes.TryGetValue("data-cms-collection", out var collection) && !string.IsNullOrWhiteSpace(collection))
            return (collection.Trim(), "collection");
        if (field.CmsAttributes.TryGetValue("data-cms-block", out var block) && !string.IsNullOrWhiteSpace(block))
            return (block.Trim(), "component");
        return (templateKey, "single");
    }

    private static string NormalizeFieldType(string? raw, string templateKey, string fieldKey, List<string> warnings)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            warnings.Add($"Template '{templateKey}', field '{fieldKey}': thiếu data-cms-type, mặc định 'string'.");
            return "string";
        }
        var t = raw.Trim();
        if (ValidFieldTypes.Contains(t)) return t;
        warnings.Add($"Template '{templateKey}', field '{fieldKey}': data-cms-type '{t}' không hợp lệ, mặc định 'string'.");
        return "string";
    }

    /// <summary>"hero_banner" -> "Hero Banner".</summary>
    private static string DisplayNameOf(string apiId)
    {
        var parts = apiId.Split('_', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts.Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
    }

    private static DbString Ansi(string value, int length) =>
        new() { Value = value, IsAnsi = true, Length = length };

    private sealed class GroupBuilder(string apiId, string kind, string displayName)
    {
        public string ApiId { get; } = apiId;
        public string Kind { get; } = kind;
        public string DisplayName { get; } = displayName;
        private readonly List<(string Key, string Type)> _fields = new();
        private readonly HashSet<string> _seen = new(StringComparer.Ordinal);

        public void AddField(string key, string type)
        {
            if (!_seen.Add(key)) return; // gộp trùng: giữ lần xuất hiện đầu tiên
            _fields.Add((key, type));
        }

        public IReadOnlyList<GeneratedField> BuildFields() =>
            _fields.Select((f, i) => new GeneratedField(f.Key, f.Type, DisplayNameOf(f.Key), i + 1)).ToList();
    }
}