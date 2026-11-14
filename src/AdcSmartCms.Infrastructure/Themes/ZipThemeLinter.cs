using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using AdcSmartCms.Application.Themes;
using HtmlAgilityPack;

namespace AdcSmartCms.Infrastructure.Themes;

/// <summary>
/// Theme Linter &amp; Validator. Chỉ ĐỌC zip trong bộ nhớ (không giải nén ra đĩa).
/// Mã lỗi:
///  ZIP001 zip hỏng/không đọc được | ZIP002 thiếu index.html ở gốc | ZIP003 đường dẫn không an toàn (zip-slip)
///  ZIP004 vượt giới hạn kích thước/số tệp
///  FILE001 tệp không giải nén được | FILE002 không phải UTF-8 hợp lệ | FILE003 tệp rỗng | FILE004 tệp quá lớn
///  HTM001 sai lồng/thiếu/thừa thẻ (stack checker, nghiêm ngặt) | HTM002 comment/script/style/thẻ không kết thúc
///  CMS001 data-cms-* không nhận diện | CMS002 giá trị rỗng | CMS003 định danh sai (khoảng trắng, >100 ký tự, không phải snake_case)
///  CMS004 data-cms-type không thuộc 14 kiểu | CMS005 data-cms-type thiếu data-cms-field | CMS006 data-cms-region trùng trong 1 tệp
///  CMS007 index.html thiếu region header/footer
///  LNK001 liên kết nội bộ bị gãy
///  CSS001 ngoặc nhọn CSS không cân bằng
/// Gói có thể có đúng 1 thư mục bọc ngoài chứa index.html; thư mục đó được bỏ qua (xem ThemeLintReport.RootFolder).
/// </summary>
public sealed class ZipThemeLinter : IThemeLinter
{
    // Nguồn: readme.docx (region/block/collection/field), comment trong data_SmartCMS.sql (menu/form), yêu cầu M1 (type).
    private static readonly HashSet<string> KnownCmsAttributes = new(StringComparer.Ordinal)
    {
        "data-cms-region", "data-cms-block", "data-cms-collection", "data-cms-field",
        "data-cms-type", "data-cms-menu", "data-cms-form"
    };

    // 14 kiểu trường, readme.docx Phân hệ 2 mục 2.
    private static readonly HashSet<string> ValidFieldTypes = new(StringComparer.Ordinal)
    {
        "string", "text", "rich_text", "integer", "decimal", "boolean", "datetime",
        "enumeration", "multi_select", "media", "relation", "repeater", "dynamic_zone", "json"
    };

    private static readonly Dictionary<string, string[]> LinkAttributes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["a"] = ["href"], ["link"] = ["href"], ["script"] = ["src"], ["img"] = ["src"],
        ["source"] = ["src"], ["video"] = ["src", "poster"], ["audio"] = ["src"]
    };

    private static readonly Regex UriScheme = new(@"^[a-zA-Z][a-zA-Z0-9+.\-]*:", RegexOptions.Compiled);
    private static readonly Regex SnakeCase = new(@"^[a-z][a-z0-9]*(_[a-z0-9]+)*$", RegexOptions.Compiled);
    private static readonly Regex CssUrl = new(@"url\(\s*(?:'([^']*)'|""([^""]*)""|([^)\s]*))\s*\)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private const int MaxIdentifierLength = 100; // field_key/api_id/menu_code/form_code đều VARCHAR(100)

    private readonly ThemeLintOptions _options;

    public ZipThemeLinter(ThemeLintOptions options) => _options = options;

    private sealed class Ctx
    {
        public Dictionary<string, ZipArchiveEntry> Files { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, string> LowerIndex { get; } = new(StringComparer.Ordinal);
        public List<ThemeLintIssue> Issues { get; } = new();
        public string RootFolder = string.Empty;
        public long TotalBytesRead;
    }

    public ThemeLintReport Lint(Stream zipStream)
    {
        var ctx = new Ctx();

        ZipArchive archive;
        List<ZipArchiveEntry> entries;
        try
        {
            archive = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);
            entries = archive.Entries.ToList();
        }
        catch (Exception ex) when (ex is InvalidDataException or NotSupportedException or IOException)
        {
            Add(ctx, "ZIP001", LintSeverity.Error, null, null, $"Không đọc được tệp zip: {ex.Message}");
            return Build(ctx, new ThemeLintStats(0, 0, 0, 0, 0));
        }

        using (archive)
        {
            if (entries.Count > _options.MaxEntries)
            {
                Add(ctx, "ZIP004", LintSeverity.Error, null, null,
                    $"Gói có {entries.Count} mục, vượt giới hạn {_options.MaxEntries}. Dừng kiểm tra.");
                return Build(ctx, new ThemeLintStats(entries.Count, 0, 0, 0, 0));
            }

            var safe = new List<(string Name, ZipArchiveEntry Entry)>();
            foreach (var e in entries)
            {
                var name = e.FullName;
                if (name.StartsWith("__MACOSX/", StringComparison.Ordinal) || name.EndsWith('/')
                    || name == ".DS_Store" || name.EndsWith("/.DS_Store", StringComparison.Ordinal)) continue;
                if (!IsSafePath(name))
                {
                    Add(ctx, "ZIP003", LintSeverity.Error, name, null,
                        "Đường dẫn không an toàn (chứa '..', '\\', bắt đầu bằng '/' hoặc ổ đĩa). Bỏ qua tệp này.");
                    continue;
                }
                safe.Add((name, e));
            }

            // Bỏ qua đúng 1 thư mục bọc ngoài nếu nó chứa index.html (Figma/Webflow hay xuất như vậy).
            var root = DetectWrapperFolder(safe.Select(s => s.Name).ToList(), out var topDirCount);
            ctx.RootFolder = root;
            foreach (var (name, e) in safe)
            {
                var rel = root.Length > 0 ? name[root.Length..] : name;
                ctx.Files[rel] = e;
                ctx.LowerIndex.TryAdd(rel.ToLowerInvariant(), rel);
            }

            if (!ctx.Files.ContainsKey("index.html"))
                Add(ctx, "ZIP002", LintSeverity.Error, null, null, topDirCount >= 2
                    ? $"Gói có {topDirCount} thư mục gốc; chỉ chấp nhận tối đa 1 thư mục bọc ngoài chứa index.html."
                    : "Thiếu index.html ở thư mục gốc của gói (hoặc trong thư mục bọc ngoài duy nhất).");

            int html = 0, css = 0, js = 0, other = 0;
            foreach (var (path, entry) in ctx.Files.OrderBy(k => k.Key, StringComparer.Ordinal))
            {
                var ext = Path.GetExtension(path).ToLowerInvariant();
                var kind = ext switch { ".html" or ".htm" => 'h', ".css" => 'c', ".js" => 'j', _ => 'o' };
                if (kind == 'o') { other++; continue; }
                if (kind == 'h') html++; else if (kind == 'c') css++; else js++;

                var text = ReadText(ctx, path, entry);
                if (text is null) continue;
                if (ctx.TotalBytesRead > _options.MaxTotalUncompressedBytes)
                {
                    Add(ctx, "ZIP004", LintSeverity.Error, null, null,
                        $"Tổng dung lượng giải nén vượt {_options.MaxTotalUncompressedBytes} byte. Dừng kiểm tra.");
                    break;
                }

                if (kind == 'h') LintHtml(ctx, path, text);
                else if (kind == 'c') LintCss(ctx, path, text);
            }

            return Build(ctx, new ThemeLintStats(ctx.Files.Count, html, css, js, other));
        }
    }

    // ---------- Đọc tệp ----------

    private string? ReadText(Ctx ctx, string path, ZipArchiveEntry entry)
    {
        try
        {
            using var s = entry.Open();
            using var ms = new MemoryStream();
            var buf = new byte[81920];
            long total = 0;
            int n;
            while ((n = s.Read(buf, 0, buf.Length)) > 0)
            {
                total += n;
                if (total > _options.MaxEntryBytes)
                {
                    Add(ctx, "FILE004", LintSeverity.Error, path, null,
                        $"Tệp lớn hơn giới hạn {_options.MaxEntryBytes} byte sau giải nén.");
                    return null;
                }
                ms.Write(buf, 0, n);
            }
            ctx.TotalBytesRead += total;

            if (total == 0)
            {
                Add(ctx, "FILE003", LintSeverity.Warning, path, null, "Tệp rỗng.");
                return null;
            }

            try
            {
                return StrictUtf8.GetString(ms.GetBuffer(), 0, (int)ms.Length).TrimStart('\uFEFF');
            }
            catch (DecoderFallbackException)
            {
                Add(ctx, "FILE002", LintSeverity.Error, path, null, "Tệp không phải UTF-8 hợp lệ.");
                return null;
            }
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException or NotSupportedException)
        {
            Add(ctx, "FILE001", LintSeverity.Error, path, null, $"Không giải nén được tệp (zip hỏng?): {ex.Message}");
            return null;
        }
    }

    // ---------- HTML ----------

    private void LintHtml(Ctx ctx, string path, string text)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(text);

        foreach (var t in HtmlTagChecker.Check(text))
            Add(ctx, t.Code, LintSeverity.Error, path, t.Line, t.Message);

        var regions = new HashSet<string>(StringComparer.Ordinal);
        var dir = DirOf(path);

        foreach (var node in doc.DocumentNode.Descendants().Where(n => n.NodeType == HtmlNodeType.Element))
        {
            HtmlAttribute? typeAttr = null;
            var hasField = false;

            foreach (var attr in node.Attributes)
            {
                if (!attr.Name.StartsWith("data-cms-", StringComparison.Ordinal)) continue;

                if (!KnownCmsAttributes.Contains(attr.Name))
                {
                    Add(ctx, "CMS001", LintSeverity.Warning, path, attr.Line,
                        $"Thuộc tính '{attr.Name}' không nằm trong danh sách data-cms-* được hỗ trợ (gõ nhầm?).");
                    continue;
                }

                var value = (attr.Value ?? string.Empty).Trim();
                if (value.Length == 0)
                {
                    Add(ctx, "CMS002", LintSeverity.Error, path, attr.Line, $"<{node.Name}> có {attr.Name} rỗng.");
                    continue;
                }
                // Định danh (mọi data-cms-* trừ data-cms-type, vốn có danh sách cố định) phải snake_case để đồng bộ với DB.
                if (attr.Name != "data-cms-type")
                {
                    string? problem = null;
                    if (value.Length > MaxIdentifierLength) problem = $"dài quá {MaxIdentifierLength} ký tự";
                    else if (value.Any(char.IsWhiteSpace)) problem = "chứa khoảng trắng";
                    else if (!SnakeCase.IsMatch(value))
                        problem = "không phải snake_case (chỉ a-z, 0-9, '_'; bắt đầu bằng chữ cái; không có '__' hay '_' ở cuối), ví dụ hero_section";
                    if (problem is not null)
                    {
                        Add(ctx, "CMS003", LintSeverity.Error, path, attr.Line,
                            $"{attr.Name}=\"{Shorten(value)}\" không hợp lệ: {problem}.");
                        continue;
                    }
                }

                switch (attr.Name)
                {
                    case "data-cms-field": hasField = true; break;
                    case "data-cms-type":
                        typeAttr = attr;
                        if (!ValidFieldTypes.Contains(value))
                            Add(ctx, "CMS004", LintSeverity.Error, path, attr.Line,
                                $"data-cms-type=\"{value}\" không thuộc 14 kiểu trường ({string.Join(", ", ValidFieldTypes)}).");
                        break;
                    case "data-cms-region":
                        if (!regions.Add(value))
                            Add(ctx, "CMS006", LintSeverity.Warning, path, attr.Line,
                                $"data-cms-region=\"{value}\" xuất hiện nhiều lần trong cùng tệp.");
                        break;
                }
            }

            if (typeAttr is not null && !hasField && !node.Attributes.Contains("data-cms-field"))
                Add(ctx, "CMS005", LintSeverity.Warning, path, typeAttr.Line,
                    $"<{node.Name}> có data-cms-type nhưng thiếu data-cms-field.");

            if (LinkAttributes.TryGetValue(node.Name, out var attrs))
                foreach (var a in attrs)
                    if (node.Attributes[a] is { } at)
                        CheckLink(ctx, path, dir, at.Line, $"<{node.Name} {a}>", at.Value);
        }

        if (path == "index.html")
            foreach (var required in new[] { "header", "footer" })
                if (!regions.Contains(required))
                    Add(ctx, "CMS007", LintSeverity.Error, path, null,
                        $"index.html thiếu data-cms-region=\"{required}\" (cần để tách master layout).");
    }

    // ---------- CSS ----------

    private void LintCss(Ctx ctx, string path, string text)
    {
        var masked = MaskCssComments(text);

        // Cân bằng ngoặc nhọn, bỏ qua nội dung trong chuỗi.
        int depth = 0, line = 1;
        char quote = '\0';
        for (var i = 0; i < masked.Length; i++)
        {
            var c = masked[i];
            if (c == '\n') line++;
            if (quote != '\0') { if (c == '\\') i++; else if (c == quote) quote = '\0'; continue; }
            if (c is '"' or '\'') { quote = c; continue; }
            if (c == '{') depth++;
            else if (c == '}' && --depth < 0)
            {
                Add(ctx, "CSS001", LintSeverity.Warning, path, line, "Dư dấu '}' không có '{' tương ứng.");
                depth = 0;
            }
        }
        if (depth > 0)
            Add(ctx, "CSS001", LintSeverity.Warning, path, null, $"Thiếu {depth} dấu '}}' đóng khối.");

        var lineStarts = LineStarts(masked);
        var dir = DirOf(path);
        foreach (Match m in CssUrl.Matches(masked))
        {
            var url = m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value;
            CheckLink(ctx, path, dir, LineAt(lineStarts, m.Index), "url()", url);
        }
    }

    // ---------- Liên kết nội bộ ----------

    private static void CheckLink(Ctx ctx, string file, string dir, int line, string where, string? raw)
    {
        var v = (raw ?? string.Empty).Trim();
        if (v.Length == 0 || v.Contains("{{") || v.Contains("{%")) return;
        if (v.StartsWith('#') || v.StartsWith("//") || UriScheme.IsMatch(v)) return; // ngoài gói / neo / data:

        var cut = v.IndexOfAny(['?', '#']);
        if (cut >= 0) v = v[..cut];
        if (v.Length == 0 || v.EndsWith('/')) return;

        var decoded = Uri.UnescapeDataString(v);
        // Chỉ kiểm tra liên kết trỏ tới TỆP (có phần mở rộng). "/san-pham" là route do CMS xử lý.
        if (!decoded[(decoded.LastIndexOf('/') + 1)..].Contains('.')) return;

        var resolved = Resolve(dir, decoded);
        if (resolved is not null && ctx.Files.ContainsKey(resolved)) return;

        var hint = resolved is not null && ctx.LowerIndex.TryGetValue(resolved.ToLowerInvariant(), out var actual)
            ? $" Gợi ý: có tệp '{actual}' (khác chữ hoa/thường, sẽ lỗi trên máy chủ phân biệt hoa thường)."
            : string.Empty;
        Add(ctx, "LNK001", LintSeverity.Error, file, line,
            $"{where} trỏ tới '{v}' nhưng không có tệp này trong gói.{hint}");
    }

    private static string? Resolve(string baseDir, string target)
    {
        var parts = new List<string>();
        if (!target.StartsWith('/'))
            parts.AddRange(baseDir.Split('/', StringSplitOptions.RemoveEmptyEntries));
        foreach (var seg in target.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (seg == ".") continue;
            if (seg == "..")
            {
                if (parts.Count == 0) return null; // thoát khỏi gốc gói
                parts.RemoveAt(parts.Count - 1);
            }
            else parts.Add(seg);
        }
        return string.Join('/', parts);
    }

    // ---------- Tiện ích ----------

    /// <summary>
    /// Trả về "ten/" nếu gói có đúng 1 thư mục gốc chứa index.html và không có tệp nào nằm cạnh nó ở gốc; ngược lại "".
    /// topDirCount = số thư mục gốc (để báo lỗi khi từ 2 trở lên).
    /// </summary>
    private static string DetectWrapperFolder(IReadOnlyList<string> names, out int topDirCount)
    {
        topDirCount = 0;
        if (names.Contains("index.html")) return string.Empty;

        var hasRootFiles = names.Any(n => !n.Contains('/'));
        var dirs = names.Where(n => n.Contains('/'))
            .Select(n => n[..n.IndexOf('/')])
            .Distinct(StringComparer.Ordinal)
            .ToList();
        topDirCount = dirs.Count;

        if (hasRootFiles || dirs.Count != 1) return string.Empty;
        return names.Contains(dirs[0] + "/index.html") ? dirs[0] + "/" : string.Empty;
    }

    private static bool IsSafePath(string name) =>
        !(name.StartsWith('/') || name.Contains('\\') || (name.Length > 1 && name[1] == ':')
          || name.Split('/').Any(s => s == ".."));

    private static string DirOf(string path)
    {
        var i = path.LastIndexOf('/');
        return i < 0 ? string.Empty : path[..i];
    }

    private static string Shorten(string s) => s.Length <= 40 ? s : s[..40] + "…";

    /// <summary>Thay comment CSS bằng khoảng trắng (giữ nguyên xuống dòng) để số dòng không đổi.</summary>
    private static string MaskCssComments(string css)
    {
        var sb = new StringBuilder(css.Length);
        for (var i = 0; i < css.Length; i++)
        {
            if (css[i] == '/' && i + 1 < css.Length && css[i + 1] == '*')
            {
                var end = css.IndexOf("*/", i + 2, StringComparison.Ordinal);
                var stop = end < 0 ? css.Length : end + 2;
                for (var j = i; j < stop; j++) sb.Append(css[j] == '\n' ? '\n' : ' ');
                i = stop - 1;
            }
            else sb.Append(css[i]);
        }
        return sb.ToString();
    }

    private static int[] LineStarts(string text)
    {
        var list = new List<int> { 0 };
        for (var i = 0; i < text.Length; i++) if (text[i] == '\n') list.Add(i + 1);
        return list.ToArray();
    }

    private static int LineAt(int[] starts, int index)
    {
        var i = Array.BinarySearch(starts, index);
        return (i >= 0 ? i : ~i - 1) + 1;
    }

    private static void Add(Ctx ctx, string code, LintSeverity sev, string? file, int? line, string message) =>
        ctx.Issues.Add(new ThemeLintIssue(code, sev, file, line, message));

    private static ThemeLintReport Build(Ctx ctx, ThemeLintStats stats)
    {
        var errors = ctx.Issues.Count(i => i.Severity == LintSeverity.Error);
        var warnings = ctx.Issues.Count - errors;
        return new ThemeLintReport(errors == 0, errors, warnings, stats, ctx.Issues, ctx.RootFolder);
    }
}
