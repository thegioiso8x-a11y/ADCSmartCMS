CREATE OR ALTER PROCEDURE dbo.usp_cms_sync_entry_indexes
    @entry_id UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Xóa chỉ mục cũ của bản ghi này
    DELETE FROM dbo.cms_entry_index_values WHERE entry_id = @entry_id;

    -- 2. Đồng bộ các trường không phụ thuộc ngôn ngữ từ cms_entries.base_data
    INSERT INTO dbo.cms_entry_index_values (entry_id, locale, field_key, string_val, display_text, number_val, date_val, bool_val)
    SELECT 
        e.id,
        'all' AS locale,
        fd.field_key,
        CASE WHEN fd.field_type IN ('string', 'enumeration', 'multi_select') 
             THEN LOWER(LTRIM(RTRIM(COALESCE(arr.value, j.value)))) END,
        CASE WHEN fd.field_type IN ('string', 'enumeration', 'multi_select') 
             THEN COALESCE(arr.value, j.value) END,
        CASE WHEN fd.field_type IN ('integer', 'decimal') 
             THEN TRY_CAST(j.value AS DECIMAL(18,4)) END,
        CASE WHEN fd.field_type = 'datetime' 
             THEN TRY_CAST(j.value AS DATETIMEOFFSET(7)) END,
        CASE WHEN fd.field_type = 'boolean' 
             THEN CASE WHEN j.value = 'true' OR j.value = '1' THEN 1 ELSE 0 END END
    FROM dbo.cms_entries e
    INNER JOIN dbo.cms_field_definitions fd ON fd.content_type_id = e.content_type_id
    CROSS APPLY OPENJSON(e.base_data) j
    OUTER APPLY OPENJSON(CASE WHEN j.type = 4 THEN j.value END) arr -- type = 4 là JSON Array
    WHERE e.id = @entry_id
      -- ĐÃ SỬA LỖI COLLATION TẠI ĐÂY
      AND j.[key] COLLATE DATABASE_DEFAULT = fd.field_key 
      AND (fd.is_indexed = 1 OR fd.is_filterable = 1)
      AND fd.is_localized = 0;

    -- 3. Đồng bộ các trường phụ thuộc ngôn ngữ từ cms_entry_locales.localized_data
    INSERT INTO dbo.cms_entry_index_values (entry_id, locale, field_key, string_val, display_text, number_val, date_val, bool_val)
    SELECT 
        e.id,
        l.locale,
        fd.field_key,
        CASE WHEN fd.field_type IN ('string', 'enumeration', 'multi_select') 
             THEN LOWER(LTRIM(RTRIM(COALESCE(arr.value, j.value)))) END,
        CASE WHEN fd.field_type IN ('string', 'enumeration', 'multi_select') 
             THEN COALESCE(arr.value, j.value) END,
        CASE WHEN fd.field_type IN ('integer', 'decimal') 
             THEN TRY_CAST(j.value AS DECIMAL(18,4)) END,
        CASE WHEN fd.field_type = 'datetime' 
             THEN TRY_CAST(j.value AS DATETIMEOFFSET(7)) END,
        CASE WHEN fd.field_type = 'boolean' 
             THEN CASE WHEN j.value = 'true' OR j.value = '1' THEN 1 ELSE 0 END END
    FROM dbo.cms_entries e
    INNER JOIN dbo.cms_entry_locales l ON l.entry_id = e.id
    INNER JOIN dbo.cms_field_definitions fd ON fd.content_type_id = e.content_type_id
    CROSS APPLY OPENJSON(l.localized_data) j
    OUTER APPLY OPENJSON(CASE WHEN j.type = 4 THEN j.value END) arr
    WHERE e.id = @entry_id
      -- ĐÃ SỬA LỖI COLLATION TẠI ĐÂY
      AND j.[key] COLLATE DATABASE_DEFAULT = fd.field_key 
      AND (fd.is_indexed = 1 OR fd.is_filterable = 1)
      AND fd.is_localized = 1;
END
GO
