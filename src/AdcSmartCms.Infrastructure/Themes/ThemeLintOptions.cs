namespace AdcSmartCms.Infrastructure.Themes;

/// <summary>Giới hạn chống zip-bomb. Giá trị mặc định chỉ là điểm khởi đầu, cần chốt theo thực tế.</summary>
public sealed record ThemeLintOptions
{
    public int MaxEntries { get; init; } = 5_000;
    public long MaxEntryBytes { get; init; } = 20L * 1024 * 1024;          // 20 MB / tệp
    public long MaxTotalUncompressedBytes { get; init; } = 200L * 1024 * 1024; // 200 MB / gói
}
