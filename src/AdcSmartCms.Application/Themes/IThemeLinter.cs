namespace AdcSmartCms.Application.Themes;

public interface IThemeLinter
{
    /// <summary>
    /// Kiểm tra gói theme .zip: toàn vẹn tệp .html/.css/.js, cú pháp data-cms-*, liên kết nội bộ.
    /// Không bao giờ ném exception vì nội dung zip xấu: mọi vấn đề được trả về trong report.
    /// </summary>
    ThemeLintReport Lint(Stream zipStream);
}
