using System.Data.Common;
using System.Text.Json;
using AdcSmartCms.Application.Forms;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Milestone 4.2: Dapper repository cho Dynamic Forms.
///  cms_forms: site_id, form_code VARCHAR(100), is_active BIT
///  cms_form_submissions: site_id, form_id, submission_data NVARCHAR(MAX) CHECK ISJSON(OBJECT),
///                        lead_status VARCHAR(30) DEFAULT 'new', tracking_metadata NVARCHAR(MAX) CHECK ISJSON(OBJECT)
/// </summary>
public sealed class FormRepository : IFormRepository
{
    private const string FindFormIdSql = """
        SELECT TOP 1 id FROM dbo.cms_forms
        WHERE site_id = @SiteId AND form_code = @FormCode AND is_active = 1;
        """;

    private const string InsertSubmissionSql = """
        INSERT INTO dbo.cms_form_submissions (site_id, form_id, submission_data, lead_status, tracking_metadata)
        OUTPUT INSERTED.id, INSERTED.form_id, INSERTED.lead_status, INSERTED.created_at
        VALUES (@SiteId, @FormId, @SubmissionData, 'new', @TrackingMetadata);
        """;

    // ---------- CRUD định nghĩa form (cms_forms) ----------

    private const string SelectFormColumns = """
        id AS Id, site_id AS SiteId, form_code AS FormCode, form_name AS FormName,
        fields_schema AS FieldsSchema, notification_config AS NotificationConfig,
        success_message_locales AS SuccessMessageLocales, is_active AS IsActive, created_at AS CreatedAt
        """;

    private const string SelectFormsSql = $"""
        SELECT {SelectFormColumns}
        FROM dbo.cms_forms
        WHERE site_id = @SiteId
        ORDER BY created_at DESC;
        """;

    private const string SelectFormByIdSql = $"""
        SELECT {SelectFormColumns}
        FROM dbo.cms_forms
        WHERE id = @FormId;
        """;

    private const string FormCodeExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_forms WHERE site_id = @SiteId AND form_code = @FormCode;
        """;

    private const string InsertFormSql = $"""
        INSERT INTO dbo.cms_forms (site_id, form_code, form_name, fields_schema, notification_config, success_message_locales, is_active)
        OUTPUT INSERTED.id, INSERTED.site_id, INSERTED.form_code, INSERTED.form_name,
               INSERTED.fields_schema, INSERTED.notification_config, INSERTED.success_message_locales,
               INSERTED.is_active, INSERTED.created_at
        VALUES (@SiteId, @FormCode, @FormName, @FieldsSchema, @NotificationConfig, @SuccessMessageLocales, @IsActive);
        """;

    private const string UpdateFormSql = """
        UPDATE dbo.cms_forms
        SET form_name               = COALESCE(@FormName, form_name),
            fields_schema           = COALESCE(@FieldsSchema, fields_schema),
            notification_config     = COALESCE(@NotificationConfig, notification_config),
            success_message_locales = COALESCE(@SuccessMessageLocales, success_message_locales),
            is_active               = COALESCE(@IsActive, is_active)
        WHERE id = @FormId;
        """;

    private const string DeleteFormSql = "DELETE FROM dbo.cms_forms WHERE id = @FormId;";

    private readonly IDbConnectionFactory _factory;

    public FormRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<SubmitFormResult?> SubmitAsync(Guid siteId, string formCode, JsonElement data, string? trackingMetadata, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var formId = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
            FindFormIdSql, new { SiteId = siteId, FormCode = Ansi(formCode, 100) }, cancellationToken: ct));
        if (formId is null) return null;

        // submission_data phải là JSON OBJECT (CHECK ISJSON(..., OBJECT)).
        var submissionData = data.ValueKind == JsonValueKind.Object ? data.GetRawText() : "{}";
        var tracking = string.IsNullOrWhiteSpace(trackingMetadata) ? "{}" : trackingMetadata;

        var row = await conn.QuerySingleAsync<(Guid Id, Guid FormId, string LeadStatus, DateTimeOffset CreatedAt)>(
            new CommandDefinition(InsertSubmissionSql, new
            {
                SiteId = siteId,
                FormId = formId.Value,
                SubmissionData = submissionData,
                TrackingMetadata = tracking
            }, cancellationToken: ct));

        return new SubmitFormResult(row.Id, row.FormId, formCode, row.LeadStatus, row.CreatedAt);
    }

    // ---------- CRUD định nghĩa form ----------

    public async Task<IReadOnlyList<FormDto>> GetFormsAsync(Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<FormDto>(new CommandDefinition(
            SelectFormsSql, new { SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<FormDto?> GetFormByIdAsync(Guid formId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        return await conn.QuerySingleOrDefaultAsync<FormDto>(new CommandDefinition(
            SelectFormByIdSql, new { FormId = formId }, cancellationToken: ct));
    }

    public async Task<FormDto?> CreateFormAsync(CreateFormRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            FormCodeExistsSql, new { request.SiteId, FormCode = Ansi(request.FormCode, 100) }, cancellationToken: ct));
        if (exists > 0) return null;

        // Truyền thẳng chuỗi JSON thô xuống SQL Server; CHECK constraint ISJSON trong DB tự validate.
        // null -> dùng giá trị mặc định của cột (fields_schema '[]', notification_config '{}', success_message_locales '{"vi":...}').
        return await conn.QuerySingleAsync<FormDto>(new CommandDefinition(InsertFormSql, new
        {
            request.SiteId,
            FormCode = Ansi(request.FormCode, 100),
            FormName = request.FormName,   // NVARCHAR(150)
            FieldsSchema = request.FieldsSchema ?? "[]",
            NotificationConfig = request.NotificationConfig ?? "{}",
            SuccessMessageLocales = request.SuccessMessageLocales ?? "{}",
            request.IsActive
        }, cancellationToken: ct));
    }

    public async Task<bool> UpdateFormAsync(Guid formId, UpdateFormRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Truyền thẳng chuỗi JSON thô; null = giữ nguyên (COALESCE). DB tự validate ISJSON.
        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateFormSql, new
        {
            FormId = formId,
            FormName = request.FormName,   // NVARCHAR(150) hoặc NULL
            FieldsSchema = request.FieldsSchema,
            NotificationConfig = request.NotificationConfig,
            SuccessMessageLocales = request.SuccessMessageLocales,
            request.IsActive
        }, cancellationToken: ct));

        return affected > 0;
    }

    public async Task<bool> DeleteFormAsync(Guid formId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // cms_form_submissions có FK ON DELETE CASCADE tới cms_forms.
        var affected = await conn.ExecuteAsync(new CommandDefinition(DeleteFormSql, new { FormId = formId }, cancellationToken: ct));
        return affected > 0;
    }

    private static DbString Ansi(string? value, int length) =>
        new() { Value = value ?? string.Empty, IsAnsi = true, Length = length };
}
