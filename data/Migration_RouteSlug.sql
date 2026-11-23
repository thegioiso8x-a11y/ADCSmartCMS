/* ============================================================================
   MIGRATION: Thêm cột route_slug cho cms_content_types (giải pháp B - alias SEO)
   ----------------------------------------------------------------------------
   Mục đích: tách "khóa kỹ thuật" (api_id) khỏi "nhãn SEO" (route_slug).
   - api_id     : khóa ổn định, dùng cho template_key (list_news/detail_news) + entry.
   - route_slug : URL hiển thị (VD 'tin-tuc'), menu + route dùng cột này nếu có,
                  ngược lại fallback về api_id.
   Idempotent: chạy nhiều lần không lỗi.
============================================================================ */
USE [ADC_SmartCMS];
GO

IF COL_LENGTH('dbo.cms_content_types', 'route_slug') IS NULL
BEGIN
    ALTER TABLE dbo.cms_content_types ADD route_slug VARCHAR(100) NULL;
END
GO

-- Index tra cứu route_slug nhanh (unique theo site + route_slug khi có giá trị).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_cms_content_types_route_slug'
      AND object_id = OBJECT_ID('dbo.cms_content_types')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX IX_cms_content_types_route_slug
    ON dbo.cms_content_types (site_id, route_slug)
    WHERE route_slug IS NOT NULL;
END
GO

/* ----------------------------------------------------------------------------
   DỌN CONTENT TYPE RÁC do AutoSchemaGenerator cũ sinh từ template_key.
   Các api_id dưới đây là template_key (list_*/detail_*/layout_master/page_*),
   KHÔNG phải content type thật. Chỉ xóa khi chưa có entry nào tham chiếu
   (an toàn: nếu đã có entry thì giữ lại để tránh mất dữ liệu).
---------------------------------------------------------------------------- */
DECLARE @junk TABLE (api_id VARCHAR(100));
INSERT INTO @junk (api_id) VALUES
    ('layout_master'), ('list_news'), ('detail_news'),
    ('list_service'), ('detail_service'),
    ('page_gioi_thieu'), ('page_lien_he');

DELETE ct
FROM dbo.cms_content_types ct
INNER JOIN @junk j ON j.api_id = ct.api_id
WHERE ct.site_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.cms_entries e WHERE e.content_type_id = ct.id);
GO

/* ----------------------------------------------------------------------------
   Gán route_slug SEO tiếng Việt cho content type thật (tùy chọn, sửa theo nhu cầu).
   Menu + route sẽ dùng route_slug nếu có.
---------------------------------------------------------------------------- */
UPDATE dbo.cms_content_types SET route_slug = 'tin-tuc' WHERE api_id = 'news'   AND route_slug IS NULL;
UPDATE dbo.cms_content_types SET route_slug = 'dich-vu' WHERE api_id = 'service' AND route_slug IS NULL;
UPDATE dbo.cms_content_types SET route_slug = 'san-pham' WHERE api_id = 'product' AND route_slug IS NULL;
GO
