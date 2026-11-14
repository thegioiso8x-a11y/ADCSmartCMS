namespace AdcSmartCms.Application.Themes;

// ---------- Auto-Schema Generator (Bước 1.5) ----------
// Đọc extracted_schema (JSON) của các template thuộc 1 theme, sinh INSERT vào
// cms_content_types + cms_field_definitions. Idempotent: chạy lại không nhân bản dữ liệu.

/// <summary>Một trường sẽ được ghi vào cms_field_definitions.</summary>
public sealed record GeneratedField(
    string FieldKey,
    string FieldType,   // đã chuẩn hóa về 1 trong các kiểu cột field_type của DDL
    string DisplayLabel,
    int SortOrder);

/// <summary>Một content type sẽ được ghi vào cms_content_types cùng danh sách trường.</summary>
public sealed record GeneratedContentType(
    string ApiId,
    string DisplayName,
    string Kind,        // 'collection' | 'single' | 'component'
    IReadOnlyList<GeneratedField> Fields);

/// <summary>Kết quả 1 lần chạy generator (để endpoint trả về làm bằng chứng).</summary>
public sealed record AutoSchemaResult(
    Guid ThemeId,
    int TemplatesRead,
    IReadOnlyList<GeneratedContentType> ContentTypes,
    IReadOnlyList<string> Warnings);

/// <summary>Kết quả ghi DB: số dòng thực sự được INSERT (không tính dòng đã tồn tại).</summary>
public sealed record AutoSchemaPersistResult(
    int ContentTypesInserted,
    int ContentTypesSkipped,
    int FieldsInserted,
    int FieldsSkipped,
    IReadOnlyList<Guid> ContentTypeIds);

public interface IAutoSchemaGenerator
{
    /// <summary>Đọc extracted_schema của theme và dựng mô hình content types + fields (chưa ghi DB).</summary>
    Task<AutoSchemaResult?> GenerateAsync(Guid themeId, CancellationToken ct);

    /// <summary>Ghi mô hình đã sinh vào DB trong 1 transaction. Trả null nếu theme không tồn tại.</summary>
    Task<AutoSchemaPersistResult?> PersistAsync(Guid themeId, CancellationToken ct);
}
