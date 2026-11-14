namespace AdcSmartCms.Application.Themes;

/// <summary>Một thẻ có thuộc tính data-cms-region="...".</summary>
public sealed record ParsedRegion(
    string Name,        // giá trị data-cms-region, VD: "header"
    string Tag,         // tên thẻ HTML, VD: "header"
    int Line);          // dòng trong file nguồn (phục vụ Theme Linter sau này)

/// <summary>Một thẻ có thuộc tính data-cms-field="...".</summary>
public sealed record ParsedField(
    string FieldKey,    // giá trị data-cms-field, VD: "title"
    string? FieldType,  // giá trị data-cms-type nếu có; null nếu HTML không khai báo (KHÔNG suy đoán)
    string Tag,
    int Line,
    IReadOnlyDictionary<string, string> CmsAttributes); // toàn bộ data-cms-* trên thẻ, để không mất thông tin

public sealed record ParsedHtmlResult(
    IReadOnlyList<ParsedRegion> Regions,
    IReadOnlyList<ParsedField> Fields,
    IReadOnlyList<string> Warnings);
