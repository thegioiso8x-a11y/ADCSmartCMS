namespace AdcSmartCms.Application.Ai;

// ---------- Milestone 7: AI-Native Capabilities (Mock) ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_ai_settings: site_id, provider, encrypted_api_key, default_text_model, default_vision_model,
//                   prompt_configs JSON OBJECT, monthly_token_limit, tokens_used_this_month, is_enabled
// Hiện tại dùng MockAiService (không gọi API thật, không phát sinh chi phí).

/// <summary>Body của POST /api/ai/generate-seo.</summary>
public sealed record AiSeoRequest(string Title, string Content);

/// <summary>Kết quả SEO sinh tự động (MetaTitle, MetaDescription, Tags, Slug gợi ý).</summary>
public sealed record AiSeoResult(
    string MetaTitle,
    string MetaDescription,
    IReadOnlyList<string> Tags,
    string SuggestedSlug,
    string Provider,
    bool IsMock);

/// <summary>Body của POST /api/ai/translate.</summary>
public sealed record AiTranslateRequest(string Text, string SourceLang, string TargetLang);

/// <summary>Kết quả dịch (kèm ngôn ngữ nguồn/đích để client hiển thị).</summary>
public sealed record AiTranslateResult(
    string TranslatedText,
    string SourceLang,
    string TargetLang,
    string Provider,
    bool IsMock);

public interface IAiService
{
    /// <summary>Sinh SEO metadata (MetaTitle, MetaDescription, Tags) từ title + content.</summary>
    Task<AiSeoResult> GenerateSeoAsync(AiSeoRequest request, CancellationToken ct = default);

    /// <summary>Dịch văn bản sang ngôn ngữ đích.</summary>
    Task<string> TranslateAsync(AiTranslateRequest request, CancellationToken ct = default);
}
