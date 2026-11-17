namespace AdcSmartCms.Application.Ai;

// ---------- AI Settings CRUD (cms_ai_settings) ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_ai_settings: site_id UNIQUE, provider VARCHAR(50), encrypted_api_key VARCHAR(1000),
//                   default_text_model VARCHAR(100), default_vision_model VARCHAR(100),
//                   prompt_configs JSON OBJECT, monthly_token_limit BIGINT, tokens_used_this_month BIGINT,
//                   is_enabled BIT, updated_at
// API Key được mã hóa AES-256 với master key lấy từ ENV ADC_AI_MASTER_KEY.
// Response KHÔNG bao giờ trả key thật (chỉ trả masked: "sk-...abcd").

/// <summary>Kết quả GET /api/ai/settings/{siteId} (không chứa key thật).</summary>
public sealed class AiSettingsDto
{
    public Guid SiteId { get; set; }
    public string Provider { get; set; } = "gemini";
    /// <summary>Key đã mask (vd "sk-...abcd"); null nếu chưa cấu hình.</summary>
    public string? ApiKeyMasked { get; set; }
    public string DefaultTextModel { get; set; } = "gemini-2.5-flash";
    public string DefaultVisionModel { get; set; } = "gemini-2.5-flash";
    public string PromptConfigs { get; set; } = "{}";
    public long? MonthlyTokenLimit { get; set; }
    public long TokensUsedThisMonth { get; set; }
    public bool IsEnabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>
/// Body của PUT /api/ai/settings/{siteId} (upsert).
/// apiKey: null = giữ nguyên; chứa "..." = masked (giữ nguyên); khác = key mới (mã hóa rồi lưu).
/// </summary>
public sealed record UpdateAiSettingsRequest(
    string? Provider = null,
    string? ApiKey = null,
    string? DefaultTextModel = null,
    string? DefaultVisionModel = null,
    string? PromptConfigs = null,
    long? MonthlyTokenLimit = null,
    bool? IsEnabled = null);

public interface IAiSettingsRepository
{
    /// <summary>
    /// Lấy cấu hình AI của site. Nếu chưa có -> trả giá trị mặc định (không insert).
    /// Lazy reset tokens_used_this_month = 0 khi updated_at thuộc tháng/năm trước.
    /// </summary>
    Task<AiSettingsDto> GetSettingsAsync(Guid siteId, CancellationToken ct);

    /// <summary>Upsert cấu hình AI. Trả về cấu hình sau khi lưu (key đã mask).</summary>
    Task<AiSettingsDto> UpsertSettingsAsync(Guid siteId, UpdateAiSettingsRequest request, CancellationToken ct);
}
