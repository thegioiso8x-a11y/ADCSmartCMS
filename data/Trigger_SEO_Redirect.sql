/* ============================================================================
   TRIGGER 1: TỰ ĐỘNG TẠO 301 REDIRECT KHI ĐỔI SLUG CỦA BÀI ĐÃ XUẤT BẢN
   (Khôi phục nguyên văn từ bản gốc Trigger_Stored Procedure_Index.sql;
    đã verify tồn tại trong DB: trg_cms_entry_locales_auto_redirect ON cms_entry_locales)
============================================================================ */
CREATE OR ALTER TRIGGER dbo.trg_cms_entry_locales_auto_redirect
ON dbo.cms_entry_locales
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(slug) RETURN;

    INSERT INTO dbo.cms_seo_redirects (site_id, old_path, new_path, status_code, note)
    SELECT 
        i.site_id,
        CONCAT(N'/', i.locale, N'/', d.slug),
        CONCAT(N'/', i.locale, N'/', i.slug),
        301,
        N'Tự động tạo 301 khi đổi slug ngày ' + CONVERT(NVARCHAR(20), SYSDATETIMEOFFSET(), 120)
    FROM inserted i
    INNER JOIN deleted d ON i.id = d.id
    INNER JOIN dbo.cms_entries e ON i.entry_id = e.id
    WHERE e.status = 'published'
      AND d.slug IS NOT NULL 
      AND i.slug IS NOT NULL
      AND d.slug <> i.slug
      AND NOT EXISTS (
          SELECT 1 FROM dbo.cms_seo_redirects r 
          WHERE r.site_id = i.site_id AND r.old_path = CONCAT(N'/', i.locale, N'/', d.slug)
      );
END
GO
