namespace AdcSmartCms.Application.Themes;

public interface IThemeParser
{
    /// <summary>Bóc tách data-cms-region và data-cms-field từ một chuỗi HTML.</summary>
    ParsedHtmlResult ParseHtml(string htmlContent);
}
