using System.Text.Json;

namespace AdcSmartCms.Application.Forms;

// ---------- Milestone 4.2: Dynamic Forms (thu thập khách hàng) ----------
// Bám DDL thật trong data_SmartCMS.sql:
//  cms_forms: site_id, form_code VARCHAR(100), form_name NVARCHAR(150), is_active BIT
//  cms_form_submissions: site_id, form_id, submission_data NVARCHAR(MAX) CHECK ISJSON(OBJECT),
//                        lead_status VARCHAR(30) DEFAULT 'new', tracking_metadata NVARCHAR(MAX) CHECK ISJSON(OBJECT)

/// <summary>Kết quả POST /api/forms/{formCode}/submit.</summary>
public sealed record SubmitFormResult(
    Guid SubmissionId,
    Guid FormId,
    string FormCode,
    string LeadStatus,
    DateTimeOffset CreatedAt);

/// <summary>Một định nghĩa form (bảng cms_forms).</summary>
public sealed class FormDto
{
    public Guid Id { get; set; }
    public Guid SiteId { get; set; }
    public string FormCode { get; set; } = string.Empty;
    public string FormName { get; set; } = string.Empty;
    public string FieldsSchema { get; set; } = "[]";          // JSON array (raw)
    public string NotificationConfig { get; set; } = "{}";    // JSON object (raw)
    public string SuccessMessageLocales { get; set; } = "{}"; // JSON object (raw)
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// Body của POST /api/forms.
/// FieldsSchema/NotificationConfig/SuccessMessageLocales là chuỗi JSON thô (raw string),
/// truyền thẳng xuống SQL Server; CHECK constraint ISJSON trong DB sẽ tự kiểm tra định dạng.
/// </summary>
public sealed record CreateFormRequest(
    Guid SiteId,
    string FormCode,
    string FormName,
    string? FieldsSchema = null,
    string? NotificationConfig = null,
    string? SuccessMessageLocales = null,
    bool IsActive = true);

/// <summary>
/// Body của PUT /api/forms/{formId}.
/// null = giữ nguyên giá trị cũ. Các trường JSON là chuỗi thô, DB tự validate.
/// </summary>
public sealed record UpdateFormRequest(
    string? FormName,
    string? FieldsSchema,
    string? NotificationConfig,
    string? SuccessMessageLocales,
    bool? IsActive);

public interface IFormRepository
{
    /// <summary>
    /// Lưu 1 submission: tìm form_id theo (site_id, form_code) rồi insert vào cms_form_submissions
    /// với submission_data = JSON của body, lead_status = 'new'.
    /// Trả null nếu form_code không tồn tại (hoặc form bị tắt).
    /// </summary>
    Task<SubmitFormResult?> SubmitAsync(Guid siteId, string formCode, JsonElement data, string? trackingMetadata, CancellationToken ct);

    /// <summary>Danh sách form của site (mới nhất trước).</summary>
    Task<IReadOnlyList<FormDto>> GetFormsAsync(Guid siteId, CancellationToken ct);

    /// <summary>Lấy 1 form theo id; null nếu không tồn tại.</summary>
    Task<FormDto?> GetFormByIdAsync(Guid formId, CancellationToken ct);

    /// <summary>Tạo form; trả null nếu (site_id, form_code) đã tồn tại.</summary>
    Task<FormDto?> CreateFormAsync(CreateFormRequest request, CancellationToken ct);

    /// <summary>Cập nhật form; trả false nếu không tồn tại.</summary>
    Task<bool> UpdateFormAsync(Guid formId, UpdateFormRequest request, CancellationToken ct);

    /// <summary>Xóa form (cascade xóa submissions). Trả false nếu không tồn tại.</summary>
    Task<bool> DeleteFormAsync(Guid formId, CancellationToken ct);
}
