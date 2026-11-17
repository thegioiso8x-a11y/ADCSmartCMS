using System.Data.Common;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AdcSmartCms.Application.Ai;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// AI Settings CRUD: Dapper repository cho bảng cms_ai_settings.
///  - API Key lưu DB dạng mã hóa AES-256-CBC (IV ngẫu nhiên, prepend vào ciphertext, base64).
///  - Master key lấy từ ENV ADC_AI_MASTER_KEY (SHA-256 để chuẩn hóa 32 byte).
///  - Response luôn mask key: "sk-...{4 ký tự cuối}".
///  - Lazy reset tokens_used_this_month khi updated_at thuộc tháng/năm trước.
/// </summary>
public sealed class AiSettingsRepository : IAiSettingsRepository
{
    private const string MasterKeyEnv = "ADC_AI_MASTER_KEY";

    private const string SelectColumns = """
        site_id AS SiteId, provider AS Provider, encrypted_api_key AS EncryptedApiKey,
        default_text_model AS DefaultTextModel, default_vision_model AS DefaultVisionModel,
        prompt_configs AS PromptConfigs, monthly_token_limit AS MonthlyTokenLimit,
        tokens_used_this_month AS TokensUsedThisMonth, is_enabled AS IsEnabled, updated_at AS UpdatedAt
        """;

    private const string SelectBySiteSql = $"""
        SELECT {SelectColumns}
        FROM dbo.cms_ai_settings
        WHERE site_id = @SiteId;
        """;

    // Lazy reset: nếu updated_at thuộc tháng/năm trước -> reset tokens_used_this_month = 0.
    private const string ResetTokensSql = """
        UPDATE dbo.cms_ai_settings
        SET tokens_used_this_month = 0
        WHERE site_id = @SiteId
          AND (YEAR(updated_at) < YEAR(SYSDATETIMEOFFSET())
               OR (YEAR(updated_at) = YEAR(SYSDATETIMEOFFSET())
                   AND MONTH(updated_at) < MONTH(SYSDATETIMEOFFSET())));
        """;

    // Upsert: MERGE theo site_id (UNIQUE). encrypted_api_key = COALESCE(@EncryptedApiKey, encrypted_api_key)
    // để giữ nguyên key cũ khi client gửi masked key (repository truyền null).
    private const string UpsertSql = """
        MERGE dbo.cms_ai_settings AS target
        USING (SELECT @SiteId AS site_id) AS src
        ON target.site_id = src.site_id
        WHEN MATCHED THEN
            UPDATE SET provider                = COALESCE(@Provider, target.provider),
                       encrypted_api_key       = COALESCE(@EncryptedApiKey, target.encrypted_api_key),
                       default_text_model      = COALESCE(@DefaultTextModel, target.default_text_model),
                       default_vision_model    = COALESCE(@DefaultVisionModel, target.default_vision_model),
                       prompt_configs          = COALESCE(@PromptConfigs, target.prompt_configs),
                       monthly_token_limit     = COALESCE(@MonthlyTokenLimit, target.monthly_token_limit),
                       is_enabled              = COALESCE(@IsEnabled, target.is_enabled),
                       updated_at              = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
            INSERT (site_id, provider, encrypted_api_key, default_text_model, default_vision_model,
                    prompt_configs, monthly_token_limit, tokens_used_this_month, is_enabled, updated_at)
            VALUES (@SiteId, COALESCE(@Provider, 'gemini'), @EncryptedApiKey,
                    COALESCE(@DefaultTextModel, 'gemini-2.5-flash'),
                    COALESCE(@DefaultVisionModel, 'gemini-2.5-flash'),
                    COALESCE(@PromptConfigs, '{}'), @MonthlyTokenLimit, 0,
                    COALESCE(@IsEnabled, 1), SYSDATETIMEOFFSET())
        OUTPUT INSERTED.site_id AS SiteId, INSERTED.provider AS Provider,
               INSERTED.encrypted_api_key AS EncryptedApiKey,
               INSERTED.default_text_model AS DefaultTextModel,
               INSERTED.default_vision_model AS DefaultVisionModel,
               INSERTED.prompt_configs AS PromptConfigs,
               INSERTED.monthly_token_limit AS MonthlyTokenLimit,
               INSERTED.tokens_used_this_month AS TokensUsedThisMonth,
               INSERTED.is_enabled AS IsEnabled, INSERTED.updated_at AS UpdatedAt;
        """;

    private readonly IDbConnectionFactory _factory;

    public AiSettingsRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<AiSettingsDto> GetSettingsAsync(Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Lazy reset trước khi đọc (chỉ ảnh hưởng bản ghi đã tồn tại).
        await conn.ExecuteAsync(new CommandDefinition(ResetTokensSql, new { SiteId = siteId }, cancellationToken: ct));

        var row = await conn.QuerySingleOrDefaultAsync<AiSettingsRow>(new CommandDefinition(
            SelectBySiteSql, new { SiteId = siteId }, cancellationToken: ct));

        return row is null ? DefaultSettings(siteId) : ToDto(row);
    }

    public async Task<AiSettingsDto> UpsertSettingsAsync(Guid siteId, UpdateAiSettingsRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Xử lý API key: null hoặc chứa "..." (masked) -> giữ nguyên key cũ (truyền null).
        string? encryptedApiKey = null;
        if (!string.IsNullOrWhiteSpace(request.ApiKey) && !request.ApiKey.Contains("..."))
        {
            encryptedApiKey = Encrypt(request.ApiKey.Trim());
        }

        // prompt_configs: null -> giữ nguyên; có giá trị -> phải là JSON object.
        string? promptConfigs = null;
        if (!string.IsNullOrWhiteSpace(request.PromptConfigs))
        {
            try
            {
                using var doc = JsonDocument.Parse(request.PromptConfigs);
                if (doc.RootElement.ValueKind != JsonValueKind.Object)
                    throw new ArgumentException("promptConfigs phải là JSON object.");
            }
            catch (JsonException)
            {
                throw new ArgumentException("promptConfigs không phải JSON hợp lệ.");
            }
            promptConfigs = request.PromptConfigs;
        }

        // Anonymous object: Dapper tự map null -> DBNull.Value cho mọi cột nullable.
        var row = await conn.QuerySingleAsync<AiSettingsRow>(new CommandDefinition(UpsertSql, new
        {
            SiteId = siteId,
            Provider = string.IsNullOrWhiteSpace(request.Provider) ? null : request.Provider.Trim(),
            EncryptedApiKey = encryptedApiKey,
            DefaultTextModel = string.IsNullOrWhiteSpace(request.DefaultTextModel) ? null : request.DefaultTextModel.Trim(),
            DefaultVisionModel = string.IsNullOrWhiteSpace(request.DefaultVisionModel) ? null : request.DefaultVisionModel.Trim(),
            PromptConfigs = promptConfigs,
            request.MonthlyTokenLimit,
            request.IsEnabled
        }, cancellationToken: ct));

        return ToDto(row);
    }

    // ---------- Helpers ----------

    private static AiSettingsDto DefaultSettings(Guid siteId) => new()
    {
        SiteId = siteId,
        Provider = "gemini",
        ApiKeyMasked = null,
        DefaultTextModel = "gemini-2.5-flash",
        DefaultVisionModel = "gemini-2.5-flash",
        PromptConfigs = "{}",
        MonthlyTokenLimit = null,
        TokensUsedThisMonth = 0,
        IsEnabled = true,
        UpdatedAt = DateTimeOffset.UtcNow
    };

    private static AiSettingsDto ToDto(AiSettingsRow row) => new()
    {
        SiteId = row.SiteId,
        Provider = row.Provider,
        ApiKeyMasked = MaskKey(Decrypt(row.EncryptedApiKey)),
        DefaultTextModel = row.DefaultTextModel,
        DefaultVisionModel = row.DefaultVisionModel,
        PromptConfigs = row.PromptConfigs,
        MonthlyTokenLimit = row.MonthlyTokenLimit,
        TokensUsedThisMonth = row.TokensUsedThisMonth,
        IsEnabled = row.IsEnabled,
        UpdatedAt = row.UpdatedAt
    };

    /// <summary>Mask key: "sk-...{4 ký tự cuối}". Null/empty -> null.</summary>
    private static string? MaskKey(string? key)
    {
        if (string.IsNullOrEmpty(key)) return null;
        var tail = key.Length <= 4 ? key : key[^4..];
        return $"sk-...{tail}";
    }

    /// <summary>Lấy 32-byte key từ ENV ADC_AI_MASTER_KEY (SHA-256).</summary>
    private static byte[] GetMasterKey()
    {
        var raw = Environment.GetEnvironmentVariable(MasterKeyEnv);
        if (string.IsNullOrWhiteSpace(raw))
            throw new InvalidOperationException(
                $"Chưa cấu hình biến môi trường '{MasterKeyEnv}' để mã hóa API Key AI.");
        return SHA256.HashData(Encoding.UTF8.GetBytes(raw));
    }

    /// <summary>Mã hóa AES-256-CBC: [16-byte IV][ciphertext] -> base64.</summary>
    private static string Encrypt(string plainText)
    {
        var key = GetMasterKey();
        using var aes = Aes.Create();
        aes.Key = key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        var result = new byte[aes.IV.Length + cipherBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, aes.IV.Length, cipherBytes.Length);
        return Convert.ToBase64String(result);
    }

    /// <summary>Giải mã AES-256-CBC. Trả null nếu dữ liệu rỗng/không hợp lệ.</summary>
    private static string? Decrypt(string? encrypted)
    {
        if (string.IsNullOrWhiteSpace(encrypted)) return null;
        try
        {
            var data = Convert.FromBase64String(encrypted);
            if (data.Length <= 16) return null;

            var key = GetMasterKey();
            using var aes = Aes.Create();
            aes.Key = key;

            var iv = new byte[16];
            Buffer.BlockCopy(data, 0, iv, 0, 16);
            aes.IV = iv;

            using var decryptor = aes.CreateDecryptor();
            var cipherBytes = new byte[data.Length - 16];
            Buffer.BlockCopy(data, 16, cipherBytes, 0, cipherBytes.Length);
            var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
            return Encoding.UTF8.GetString(plainBytes);
        }
        catch
        {
            // Key master đổi hoặc dữ liệu hỏng -> coi như chưa có key.
            return null;
        }
    }

    /// <summary>Dòng đọc từ cms_ai_settings.</summary>
    private sealed class AiSettingsRow
    {
        public Guid SiteId { get; set; }
        public string Provider { get; set; } = "gemini";
        public string? EncryptedApiKey { get; set; }
        public string DefaultTextModel { get; set; } = "gemini-2.5-flash";
        public string DefaultVisionModel { get; set; } = "gemini-2.5-flash";
        public string PromptConfigs { get; set; } = "{}";
        public long? MonthlyTokenLimit { get; set; }
        public long TokensUsedThisMonth { get; set; }
        public bool IsEnabled { get; set; }
        public DateTimeOffset UpdatedAt { get; set; }
    }
}
