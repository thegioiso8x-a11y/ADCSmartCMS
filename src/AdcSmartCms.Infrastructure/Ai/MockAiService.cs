using System.Text;
using System.Text.RegularExpressions;
using AdcSmartCms.Application.Ai;

namespace AdcSmartCms.Infrastructure.Ai;

/// <summary>
/// Milestone 7: Mock AI service - KHÔNG gọi API thật (tránh phát sinh chi phí).
/// Trả dữ liệu có cấu trúc đúng như provider thật (Gemini/OpenAI) để client tích hợp trước.
/// Khi cần dùng thật: thay bằng implementation đọc cms_ai_settings (provider, encrypted_api_key, prompt_configs).
/// </summary>
public sealed partial class MockAiService : IAiService
{
    private const string ProviderName = "mock";

    public Task<AiSeoResult> GenerateSeoAsync(AiSeoRequest request, CancellationToken ct = default)
    {
        var title = (request.Title ?? string.Empty).Trim();
        var content = (request.Content ?? string.Empty).Trim();

        // MetaTitle: tối đa ~60 ký tự (chuẩn SEO), fallback khi title rỗng.
        var metaTitle = title.Length == 0 ? "ADC Smart CMS" : title;
        if (metaTitle.Length > 60) metaTitle = metaTitle[..57].TrimEnd() + "...";

        // MetaDescription: tối đa ~160 ký tự, lấy từ content (bỏ thẻ HTML).
        var plain = StripHtml(content);
        var metaDesc = plain.Length == 0 ? $"Tìm hiểu thêm về {metaTitle}." : plain;
        if (metaDesc.Length > 160) metaDesc = metaDesc[..157].TrimEnd() + "...";

        var tags = ExtractTags(title, plain);
        var slug = Slugify(title.Length == 0 ? metaTitle : title);

        return Task.FromResult(new AiSeoResult(metaTitle, metaDesc, tags, slug, ProviderName, true));
    }

    public Task<string> TranslateAsync(AiTranslateRequest request, CancellationToken ct = default)
    {
        var target = string.IsNullOrWhiteSpace(request.TargetLang) ? "en" : request.TargetLang.Trim().ToUpperInvariant();
        var source = string.IsNullOrWhiteSpace(request.SourceLang) ? "vi" : request.SourceLang.Trim().ToUpperInvariant();
        var text = request.Text ?? string.Empty;

        // Mock: bọc nhãn ngôn ngữ để client thấy rõ luồng dữ liệu.
        return Task.FromResult($"[Translated to {target}] {text} (source: {source})");
    }

    private static string StripHtml(string html) =>
        HtmlTagRegex().Replace(html, " ").Replace("&nbsp;", " ").Trim();

    /// <summary>Lấy tối đa 5 tag từ các từ dài nhất (bỏ stop-word tiếng Việt/Anh cơ bản).</summary>
    private static IReadOnlyList<string> ExtractTags(string title, string content)
    {
        var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "và", "của", "cho", "với", "các", "những", "một", "là", "trong", "khi", "để", "có", "không",
            "the", "and", "for", "with", "this", "that", "from", "your", "you", "are", "was", "our"
        };

        var words = WordRegex().Matches($"{title} {content}")
            .Select(m => m.Value.ToLowerInvariant())
            .Where(w => w.Length >= 4 && !stopWords.Contains(w))
            .GroupBy(w => w)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Take(5)
            .Select(g => g.Key)
            .ToList();

        return words.Count > 0 ? words : new List<string> { "cms", "content" };
    }

    private static string Slugify(string input)
    {
        var normalized = input.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var ch in normalized)
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) == System.Globalization.UnicodeCategory.NonSpacingMark)
                continue;
            sb.Append(ch);
        }

        var ascii = sb.ToString().Normalize(NormalizationForm.FormC)
            .Replace('đ', 'd').Replace('Đ', 'D').ToLowerInvariant();

        var slug = NonSlugRegex().Replace(ascii, "-").Trim('-');
        return slug.Length == 0 ? "page" : slug;
    }

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex HtmlTagRegex();

    [GeneratedRegex(@"[\p{L}\p{N}]+")]
    private static partial Regex WordRegex();

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugRegex();
}
