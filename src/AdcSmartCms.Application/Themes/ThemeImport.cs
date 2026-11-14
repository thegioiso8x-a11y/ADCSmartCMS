using System.Globalization;
using System.Text;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace AdcSmartCms.Application.Themes;

// ---------- Repository (Dapper) ----------

public sealed record ThemeInsert(string ThemeCode, string ThemeName, string Version, string AssetsBaseUrl);

public sealed record ThemeTemplateInsert(string TemplateKey, string TemplateType, string CompiledHtml, string ExtractedSchemaJson);

public sealed record ThemeCreated(Guid ThemeId, IReadOnlyList<Guid> TemplateIds);

public interface IThemeRepository
{
    /// <summary>
    /// Insert 1 dòng cms_themes + các dòng cms_theme_templates trong CÙNG 1 transaction.
    /// Trả null nếu theme_code đã tồn tại (vi phạm UQ_cms_themes_code); khi đó không có gì được ghi.
    /// </summary>
    Task<ThemeCreated?> CreateAsync(ThemeInsert theme, IReadOnlyList<ThemeTemplateInsert> templates, CancellationToken ct);
}

// ---------- Import use-case ----------

public sealed record ThemeImportRequest(string ThemeCode, string ThemeName, string Version, string AssetsBaseUrl)
{
    private static readonly Regex SnakeCase = new(@"^[a-z][a-z0-9]*(_[a-z0-9]+)*$", RegexOptions.Compiled);

    /// <summary>Kiểm tra theo DDL cms_themes: theme_code VARCHAR(100), theme_name NVARCHAR(150), version VARCHAR(20), assets_base_url VARCHAR(500).</summary>
    public IReadOnlyList<string> Validate()
    {
        var errors = new List<string>();
        if (ThemeCode.Length is 0 or > 100 || !SnakeCase.IsMatch(ThemeCode))
            errors.Add("themeCode phải là snake_case (a-z, 0-9, '_'; bắt đầu bằng chữ cái; tối đa 100 ký tự).");
        if (string.IsNullOrWhiteSpace(ThemeName) || ThemeName.Length > 150)
            errors.Add("themeName không được rỗng và tối đa 150 ký tự.");
        if (string.IsNullOrWhiteSpace(Version) || Version.Length > 20 || !IsAscii(Version))
            errors.Add("version không được rỗng, tối đa 20 ký tự, chỉ ASCII.");
        if (string.IsNullOrWhiteSpace(AssetsBaseUrl) || AssetsBaseUrl.Length > 500 || !IsAscii(AssetsBaseUrl))
            errors.Add("assetsBaseUrl là bắt buộc, tối đa 500 ký tự, chỉ ASCII (cột VARCHAR).");
        return errors;
    }

    private static bool IsAscii(string s) => s.All(c => c < 128);
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ThemeImportStatus
{
    Imported,
    LintFailed,
    DuplicateThemeCode
}

public sealed record ThemeImportResult(
    ThemeImportStatus Status,
    ThemeLintReport Lint,
    Guid? ThemeId,
    Guid? TemplateId,
    ParsedHtmlResult? Parsed);

public interface IThemeImporter
{
    /// <summary>Lint gói zip; nếu hợp lệ thì lưu theme + layout_master (index.html) vào DB.</summary>
    Task<ThemeImportResult> ImportAsync(Stream zipStream, ThemeImportRequest request, CancellationToken ct);
}

public static class ThemeNaming
{
    /// <summary>"Tech Store v2.zip" -> "tech_store_v2". Bỏ dấu tiếng Việt, ký tự lạ thành '_'.</summary>
    public static string Slugify(string name)
    {
        var d = name.Replace('đ', 'd').Replace('Đ', 'D').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in d)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(c is >= 'a' and <= 'z' or >= '0' and <= '9' ? c
                    : c is >= 'A' and <= 'Z' ? char.ToLowerInvariant(c)
                    : '_');
        }
        return Regex.Replace(sb.ToString(), "_+", "_").Trim('_');
    }
}
