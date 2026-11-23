using AdcSmartCms.Application.Themes;
using HtmlAgilityPack;

namespace AdcSmartCms.Infrastructure.Themes;

public sealed class HtmlThemeParser : IThemeParser
{
    private const string RegionAttr = "data-cms-region";
    private const string FieldAttr = "data-cms-field";
    private const string TypeAttr = "data-cms-type";
    private const string CmsPrefix = "data-cms-";

    public ParsedHtmlResult ParseHtml(string htmlContent)
    {
        var regions = new List<ParsedRegion>();
        var fields = new List<ParsedField>();
        var warnings = new List<string>();

        if (string.IsNullOrWhiteSpace(htmlContent))
            return new ParsedHtmlResult(regions, fields, warnings);

        var doc = new HtmlDocument();
        doc.LoadHtml(htmlContent);

        // Thứ tự theo vị trí xuất hiện trong tài liệu
        var nodes = doc.DocumentNode.SelectNodes($"//*[@{RegionAttr} or @{FieldAttr}]");
        if (nodes is null)
            return new ParsedHtmlResult(regions, fields, warnings);

        foreach (var node in nodes)
        {
            if (node.Attributes.Contains(RegionAttr))
            {
                var name = node.GetAttributeValue(RegionAttr, string.Empty).Trim();
                if (name.Length == 0)
                    warnings.Add($"Dòng {node.Line}: <{node.Name}> có {RegionAttr} rỗng, bỏ qua.");
                else
                    regions.Add(new ParsedRegion(name, node.Name, node.Line));
            }

            if (node.Attributes.Contains(FieldAttr))
            {
                var key = node.GetAttributeValue(FieldAttr, string.Empty).Trim();
                if (key.Length == 0)
                {
                    warnings.Add($"Dòng {node.Line}: <{node.Name}> có {FieldAttr} rỗng, bỏ qua.");
                    continue;
                }

                var type = node.GetAttributeValue(TypeAttr, string.Empty).Trim();

                // Gắn data-cms-collection/block từ ancestor gần nhất (field nằm trong collection/block).
                // Thứ tự: ancestor trước (gần nhất thắng), rồi attributes trên chính node ghi đè.
                var cmsAttrs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var ancestor in node.Ancestors())
                    foreach (var a in ancestor.Attributes.Where(x => x.Name.StartsWith(CmsPrefix, StringComparison.OrdinalIgnoreCase)))
                        if (!cmsAttrs.ContainsKey(a.Name)) cmsAttrs[a.Name] = a.Value ?? string.Empty;
                foreach (var a in node.Attributes.Where(x => x.Name.StartsWith(CmsPrefix, StringComparison.OrdinalIgnoreCase)))
                    cmsAttrs[a.Name] = a.Value ?? string.Empty;

                // Heuristic: nếu HTML không khai báo data-cms-type, suy type từ tag/class/key.
                var effectiveType = type.Length > 0 ? type : InferFieldType(node, key);

                fields.Add(new ParsedField(key, effectiveType, node.Name, node.Line, cmsAttrs));
            }
        }

        return new ParsedHtmlResult(regions, fields, warnings);
    }

    /// <summary>
    /// Suy field_type từ tag/class/key khi HTML không khai báo data-cms-type.
    /// Quy tắc (generic, không hardcode theme):
    ///  - &lt;img&gt; / &lt;video&gt; / &lt;source&gt; / key chứa image/avatar/thumbnail/photo → media
    ///  - class chứa "prose"/"rich"/"content" hoặc tag &lt;article&gt; → rich_text
    ///  - key chứa date/_at/time hoặc tag &lt;time&gt; → datetime
    ///  - key chứa list/items/rows/departments/tags (số nhiều) → json
    ///  - còn lại → string
    /// </summary>
    private static string InferFieldType(HtmlNode node, string key)
    {
        var tag = node.Name.ToLowerInvariant();
        var cls = node.GetAttributeValue("class", string.Empty).ToLowerInvariant();
        var k = key.ToLowerInvariant();

        if (tag is "img" or "video" or "source" or "picture"
            || k.Contains("image") || k.Contains("avatar") || k.Contains("thumbnail") || k.Contains("photo"))
            return "media";

        if (tag == "article" || cls.Contains("prose") || cls.Contains("rich") || cls.Contains("content"))
            return "rich_text";

        if (tag == "time" || k.Contains("date") || k.EndsWith("_at") || k.Contains("time"))
            return "datetime";

        if (k.Contains("list") || k.Contains("items") || k.Contains("rows")
            || k.Contains("departments") || k.EndsWith("tags"))
            return "json";

        return "string";
    }
}
