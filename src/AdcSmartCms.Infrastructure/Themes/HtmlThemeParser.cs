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
                var cmsAttrs = node.Attributes
                    .Where(a => a.Name.StartsWith(CmsPrefix, StringComparison.OrdinalIgnoreCase))
                    .ToDictionary(a => a.Name, a => a.Value ?? string.Empty, StringComparer.OrdinalIgnoreCase);

                fields.Add(new ParsedField(key, type.Length == 0 ? null : type, node.Name, node.Line, cmsAttrs));
            }
        }

        return new ParsedHtmlResult(regions, fields, warnings);
    }
}
