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

        // compiled_html hiện lưu HTML gốc của index.html; bước biên dịch Liquid sẽ làm ở bước sau.
        var created = await _repository.CreateAsync(
            new ThemeInsert(request.ThemeCode, request.ThemeName, request.Version, request.AssetsBaseUrl),
            [new ThemeTemplateInsert(LayoutMasterKey, LayoutType, indexHtml, schemaJson)],
            ct);

        return created is null
            ? new ThemeImportResult(ThemeImportStatus.DuplicateThemeCode, report, null, null, parsed)
            : new ThemeImportResult(ThemeImportStatus.Imported, report, created.ThemeId, created.TemplateIds[0], parsed);
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
