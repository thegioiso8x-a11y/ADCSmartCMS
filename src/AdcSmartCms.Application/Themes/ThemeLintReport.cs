using System.Text.Json.Serialization;

namespace AdcSmartCms.Application.Themes;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum LintSeverity
{
    Warning,
    Error
}

/// <summary>Một phát hiện của Theme Linter. Code ổn định để UI/CI có thể lọc theo mã.</summary>
public sealed record ThemeLintIssue(
    string Code,
    LintSeverity Severity,
    string? File,       // đường dẫn trong zip; null nếu lỗi ở mức gói
    int? Line,          // dòng 1-based nếu xác định được
    string Message);

public sealed record ThemeLintStats(int TotalFiles, int HtmlFiles, int CssFiles, int JsFiles, int OtherFiles);

public sealed record ThemeLintReport(
    bool IsValid,       // true khi ErrorCount == 0 (Warning không làm gói thành không hợp lệ)
    int ErrorCount,
    int WarningCount,
    ThemeLintStats Stats,
    IReadOnlyList<ThemeLintIssue> Issues,
    string RootFolder = ""); // thư mục bọc ngoài đã bỏ qua, VD "mytheme/"; "" nếu index.html nằm ở gốc zip
