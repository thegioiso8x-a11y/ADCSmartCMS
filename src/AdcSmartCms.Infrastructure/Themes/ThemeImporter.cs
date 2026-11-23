using System.IO.Compression;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using AdcSmartCms.Application.Themes;

namespace AdcSmartCms.Infrastructure.Themes;

public sealed class ThemeImporter : IThemeImporter
{
    private const string LayoutMasterKey = "layout_master";
    private const string LayoutType = "layout";

    // camelCase (khớp JSON của /api/debug/parse-html) + giữ nguyên tiếng Việt thay vì \uXXXX.
    private static readonly JsonSerializerOptions SchemaJson = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private readonly IThemeLinter _linter;
    private readonly IThemeParser _parser;
    private readonly IThemeRepository _repository;

    public ThemeImporter(IThemeLinter linter, IThemeParser parser, IThemeRepository repository)
    {
        _linter = linter;
        _parser = parser;
        _repository = repository;
    }

    public async Task<ThemeImportResult> ImportAsync(Stream zipStream, ThemeImportRequest request, CancellationToken ct)
    {
        // Cần đọc zip 2 lần (lint, rồi lấy index.html) nên bảo đảm stream seekable.
        var stream = zipStream;
        if (!stream.CanSeek)
        {
            var copy = new MemoryStream();
            await zipStream.CopyToAsync(copy, ct);
            stream = copy;
        }

        stream.Position = 0;
        var report = _linter.Lint(stream);
        if (!report.IsValid)
            return new ThemeImportResult(ThemeImportStatus.LintFailed, report, null, null, null);

        stream.Position = 0;
        var indexHtml = ReadEntryText(stream, report.RootFolder + "index.html");

        var parsed = _parser.ParseHtml(indexHtml);
        var schemaJson = JsonSerializer.Serialize(parsed, SchemaJson);

        // Đọc TẤT CẢ file .html trong gói (không chỉ index.html) để không bỏ sót page-*/list-*/detail-*.
        // index.html -> layout_master; các file còn lại map theo tên (chuẩn hóa '-' -> '_').
        stream.Position = 0;
        var templates = BuildTemplates(stream, report.RootFolder, indexHtml, schemaJson);
        var created = await _repository.CreateAsync(
            new ThemeInsert(request.ThemeCode, request.ThemeName, request.Version, request.AssetsBaseUrl),
            templates,
            ct);

        return created is null
            ? new ThemeImportResult(ThemeImportStatus.DuplicateThemeCode, report, null, null, parsed)
            : new ThemeImportResult(ThemeImportStatus.Imported, report, created.ThemeId, created.TemplateIds[0], parsed);
    }

    /// <summary>
    /// Duyệt mọi entry .html trong zip, sinh ThemeTemplateInsert cho từng file.
    /// index.html dùng lại indexHtml/schemaJson đã parse (tránh đọc lại); file khác tự parse schema riêng.
    /// </summary>
    private List<ThemeTemplateInsert> BuildTemplates(Stream zip, string rootFolder, string indexHtml, string indexSchemaJson)
    {
        var result = new List<ThemeTemplateInsert>();
        var seenKeys = new HashSet<string>(StringComparer.Ordinal);

        using var archive = new ZipArchive(zip, ZipArchiveMode.Read, leaveOpen: true);
        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrEmpty(entry.Name)) continue;
            if (!entry.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase)
                && !entry.Name.EndsWith(".htm", StringComparison.OrdinalIgnoreCase)) continue;

            var fullName = entry.FullName.Replace('\\', '/');
            var rel = rootFolder.Length > 0 && fullName.StartsWith(rootFolder, StringComparison.OrdinalIgnoreCase)
                ? fullName[rootFolder.Length..]
                : fullName;

            var (key, type) = MapTemplate(rel);
            if (!seenKeys.Add(key)) continue; // tránh trùng template_key (UQ_theme_template_key)

            string html, schemaJson;
            if (string.Equals(rel, "index.html", StringComparison.OrdinalIgnoreCase))
            {
                html = indexHtml;
                schemaJson = indexSchemaJson;
            }
            else
            {
                using var reader = new StreamReader(entry.Open(), new UTF8Encoding(false, true));
                html = reader.ReadToEnd().TrimStart('\uFEFF');
                schemaJson = JsonSerializer.Serialize(_parser.ParseHtml(html), SchemaJson);
            }

            result.Add(new ThemeTemplateInsert(key, type, html, schemaJson));
        }

        // Đảm bảo luôn có layout_master (linter đã bắt buộc index.html, nhưng phòng hờ).
        if (!seenKeys.Contains(LayoutMasterKey))
            result.Insert(0, new ThemeTemplateInsert(LayoutMasterKey, LayoutType, indexHtml, indexSchemaJson));

        return result;
    }

    /// <summary>
    /// Map tên file (không đuôi) -> (template_key, template_type).
    /// index -> layout_master/layout; page-*/list-*/detail-* -> page_*/list_*/detail_* (chuẩn hóa '-' -> '_').
    /// Giữ nguyên case cũ (page_home với gạch dưới vẫn khớp). File .html khác -> fallback page.
    /// </summary>
    private static (string Key, string Type) MapTemplate(string relPath)
    {
        var name = Path.GetFileNameWithoutExtension(relPath).ToLowerInvariant();
        if (name == "index") return (LayoutMasterKey, LayoutType);

        var norm = name.Replace('-', '_');
        if (norm.StartsWith("page_", StringComparison.Ordinal)) return (norm, "page");
        if (norm.StartsWith("list_", StringComparison.Ordinal)) return (norm, "collection_list");
        if (norm.StartsWith("detail_", StringComparison.Ordinal)) return (norm, "collection_detail");
        return (norm, "page");
    }

    private static string ReadEntryText(Stream zip, string entryName)
    {
        using var archive = new ZipArchive(zip, ZipArchiveMode.Read, leaveOpen: true);
        var entry = archive.GetEntry(entryName)
            ?? throw new InvalidOperationException($"Không tìm thấy '{entryName}' dù linter báo hợp lệ.");
        using var reader = new StreamReader(entry.Open(), new UTF8Encoding(false, true));
        return reader.ReadToEnd().TrimStart('\uFEFF');
    }
}

