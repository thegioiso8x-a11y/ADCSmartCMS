namespace AdcSmartCms.Api.Contracts;

/// <summary>
/// Body của PUT /api/entries/{entryId}.
/// Không cần SiteId / ContentTypeApiId (đã xác định qua entryId).
/// BaseData / LocalizedData là chuỗi JSON object (client tự serialize).
/// </summary>
public sealed record UpdateEntryRequest(
    string? Title,
    string? Slug,
    string? BaseData,
    string? LocalizedData,
    string? Locale = "vi");
