namespace AdcSmartCms.Infrastructure.Themes;

public readonly record struct TagIssue(string Code, int Line, string Message);

/// <summary>
/// Kiểm tra lồng thẻ HTML bằng stack. NGHIÊM NGẶT hơn đặc tả HTML5: mọi thẻ không-void phải được đóng
/// tường minh (kể cả &lt;p&gt;, &lt;li&gt;), vì mục tiêu là "HTML sạch" cho bộ Parser/Liquid.
///  - Bỏ qua thẻ void (img, br, hr, input, meta, link, ... đủ danh sách HTML5).
///  - Bỏ qua nội dung trong &lt;script&gt;/&lt;style&gt; và comment &lt;!-- --&gt;, doctype.
///  - Tự đóng "/&gt;" chỉ hợp lệ với thẻ void hoặc bên trong &lt;svg&gt;/&lt;math&gt;.
/// Mã: HTM001 sai lồng/thiếu/thừa thẻ | HTM002 cấu trúc không kết thúc (comment, script, style, thẻ thiếu '&gt;').
/// </summary>
public static class HtmlTagChecker
{
    private static readonly HashSet<string> VoidElements = new(StringComparer.Ordinal)
    {
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
    };

    private static readonly HashSet<string> RawTextElements = new(StringComparer.Ordinal) { "script", "style" };
    private static readonly HashSet<string> ForeignRoots = new(StringComparer.Ordinal) { "svg", "math" };

    public static IReadOnlyList<TagIssue> Check(string html)
    {
        var issues = new List<TagIssue>();
        var stack = new List<(string Name, int Line)>();
        int i = 0, line = 1, n = html.Length;

        while (i < n)
        {
            var lt = html.IndexOf('<', i);
            if (lt < 0) break;
            line += Newlines(html, i, lt);
            i = lt;

            // <!-- comment -->
            if (string.CompareOrdinal(html, i, "<!--", 0, 4) == 0)
            {
                var end = html.IndexOf("-->", i + 4, StringComparison.Ordinal);
                if (end < 0)
                {
                    issues.Add(new(TagCodes.Structure, line, "Comment '<!--' không có '-->' kết thúc."));
                    return issues;
                }
                line += Newlines(html, i, end);
                i = end + 3;
                continue;
            }

            // <!DOCTYPE ...>, <![CDATA[ ... ]]>, <?xml ... ?>
            if (i + 1 < n && (html[i + 1] == '!' || html[i + 1] == '?'))
            {
                var gt = html.IndexOf('>', i + 2);
                if (gt < 0) break;
                line += Newlines(html, i, gt);
                i = gt + 1;
                continue;
            }

            var closing = i + 1 < n && html[i + 1] == '/';
            var nameStart = i + (closing ? 2 : 1);
            if (nameStart >= n || !IsAsciiLetter(html[nameStart]))
            {
                i++; // '<' nằm trong văn bản (vd "a < b"), không phải thẻ
                continue;
            }

            var j = nameStart;
            while (j < n && (IsAsciiLetter(html[j]) || (html[j] >= '0' && html[j] <= '9') || html[j] is '-' or ':' or '_')) j++;
            var name = html[nameStart..j].ToLowerInvariant();
            var tagLine = line;

            // Tìm '>' kết thúc thẻ, bỏ qua '>' nằm trong giá trị thuộc tính có dấu nháy.
            var k = j;
            var quote = '\0';
            var found = false;
            for (; k < n; k++)
            {
                var c = html[k];
                if (quote != '\0') { if (c == quote) quote = '\0'; continue; }
                if (c is '"' or '\'') { quote = c; continue; }
                if (c == '>') { found = true; break; }
            }
            if (!found)
            {
                issues.Add(new(TagCodes.Structure, tagLine, $"Thẻ <{name}> không có dấu '>' kết thúc."));
                return issues;
            }

            var selfClosing = !closing && k > j && html[k - 1] == '/';
            line += Newlines(html, i, k);
            i = k + 1;

            if (closing)
            {
                var idx = stack.FindLastIndex(e => e.Name == name);
                if (idx < 0)
                {
                    issues.Add(new(TagCodes.Nesting, tagLine, $"Thẻ đóng </{name}> không có thẻ mở tương ứng."));
                    continue;
                }
                for (var s = stack.Count - 1; s > idx; s--)
                    issues.Add(new(TagCodes.Nesting, stack[s].Line,
                        $"Thẻ <{stack[s].Name}> (dòng {stack[s].Line}) chưa được đóng trước </{name}> ở dòng {tagLine}."));
                stack.RemoveRange(idx, stack.Count - idx);
                continue;
            }

            if (VoidElements.Contains(name)) continue;

            if (selfClosing)
            {
                if (!stack.Any(e => ForeignRoots.Contains(e.Name)) && !ForeignRoots.Contains(name))
                    issues.Add(new(TagCodes.Nesting, tagLine,
                        $"<{name} /> tự đóng không hợp lệ trong HTML (chỉ thẻ void hoặc bên trong <svg>/<math>). Hãy viết <{name}></{name}>."));
                else if (ForeignRoots.Contains(name))
                    { /* <svg/> rỗng: hợp lệ */ }
                continue;
            }

            stack.Add((name, tagLine));

            if (RawTextElements.Contains(name))
            {
                var close = html.IndexOf("</" + name, i, StringComparison.OrdinalIgnoreCase);
                if (close < 0)
                {
                    issues.Add(new(TagCodes.Structure, tagLine, $"Thẻ <{name}> không có </{name}> kết thúc."));
                    return issues;
                }
                line += Newlines(html, i, close);
                i = close; // vòng sau xử lý thẻ đóng </script>/</style> bình thường
            }
        }

        for (var s = stack.Count - 1; s >= 0; s--)
            issues.Add(new(TagCodes.Nesting, stack[s].Line, $"Thẻ <{stack[s].Name}> (dòng {stack[s].Line}) không được đóng."));

        return issues;
    }

    private static int Newlines(string text, int from, int to)
    {
        var count = 0;
        for (var p = from; p < to; p++) if (text[p] == '\n') count++;
        return count;
    }

    private static bool IsAsciiLetter(char c) => c is >= 'a' and <= 'z' or >= 'A' and <= 'Z';

    private static class TagCodes
    {
        public const string Nesting = "HTM001";
        public const string Structure = "HTM002";
    }
}
