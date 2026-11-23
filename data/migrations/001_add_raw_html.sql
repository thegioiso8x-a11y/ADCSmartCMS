/* ============================================================================
   MIGRATION 001: Thêm cột raw_html cho cms_theme_templates
   ----------------------------------------------------------------------------
   raw_html = SOURCE OF TRUTH (HTML gốc từ theme, KHÔNG bị convert Liquid).
   - compiled_html : HTML đã convert Liquid (dùng để render Public Site).
   - raw_html      : HTML gốc (dùng để re-parse schema khi Parser thay đổi).
   T1 (sau này) PHẢI giữ raw_html nguyên vẹn, chỉ UPDATE compiled_html.
   Idempotent: chạy nhiều lần không lỗi.
============================================================================ */
USE [ADC_SmartCMS];
GO

IF COL_LENGTH('dbo.cms_theme_templates', 'raw_html') IS NULL
    ALTER TABLE dbo.cms_theme_templates ADD raw_html NVARCHAR(MAX) NULL;
GO

-- Backfill: dữ liệu cũ chưa có raw_html -> lấy compiled_html hiện tại (đang là HTML gốc).
UPDATE dbo.cms_theme_templates SET raw_html = compiled_html WHERE raw_html IS NULL;
GO
