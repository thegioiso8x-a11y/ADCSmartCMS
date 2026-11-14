/* ============================================================================
   STORED PROCEDURE 2: DYNAMIC FACETED FILTER ENGINE
   Cấu trúc mẫu của @filters_json:
   [
     {"field": "brand", "op": "in", "values": ["apple", "samsung"]},
     {"field": "ram", "op": "in", "values": ["8gb", "12gb"]},
     {"field": "sale_price", "op": "range", "min": 15000000, "max": 35000000},
     {"field": "category_path", "op": "hierarchy", "path": "/dien-tu/dien-thoai/"}
   ]
============================================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_cms_dynamic_filter_entries
    @site_id UNIQUEIDENTIFIER,
    @content_type_api_id VARCHAR(100),
    @locale VARCHAR(10) = 'vi',
    @keyword NVARCHAR(250) = NULL,
    @filters_json NVARCHAR(MAX) = NULL, -- JSON Array chứa các điều kiện lọc động
    @sort_field VARCHAR(100) = 'published_at', -- 'published_at', 'title', hoặc bất kỳ field_key số nào (VD: 'sale_price', 'area')
    @sort_dir VARCHAR(4) = 'DESC',      -- 'ASC' hoặc 'DESC'
    @page_index INT = 1,
    @page_size INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    IF @page_index < 1 SET @page_index = 1;
    IF @page_size < 1 SET @page_size = 20;

    -- Bảng tạm lưu các điều kiện lọc đã bóc tách từ JSON
    CREATE TABLE #ParsedFilters (
        filter_id INT IDENTITY(1,1) PRIMARY KEY,
        field_key VARCHAR(100),
        op VARCHAR(20),
        values_json NVARCHAR(MAX),
        min_val DECIMAL(18,4),
        max_val DECIMAL(18,4),
        hierarchy_prefix VARCHAR(500)
    );

    IF @filters_json IS NOT NULL AND ISJSON(@filters_json, ARRAY) = 1
    BEGIN
        INSERT INTO #ParsedFilters (field_key, op, values_json, min_val, max_val, hierarchy_prefix)
        SELECT 
            field_key, op, values_json, min_val, max_val, hierarchy_prefix
        FROM OPENJSON(@filters_json)
        WITH (
            field_key VARCHAR(100) '$.field',
            op VARCHAR(20) '$.op',
            values_json NVARCHAR(MAX) '$.values' AS JSON,
            min_val DECIMAL(18,4) '$.min',
            max_val DECIMAL(18,4) '$.max',
            hierarchy_prefix VARCHAR(500) '$.path'
        );
    END

    DECLARE @total_filter_groups INT = (SELECT COUNT(*) FROM #ParsedFilters);

    -- Bảng tạm chứa danh sách entry_id thỏa mãn TẤT CẢ các nhóm điều kiện lọc (Phép giao AND giữa các nhóm, OR trong cùng 1 nhóm)
    CREATE TABLE #MatchedEntries (
        entry_id UNIQUEIDENTIFIER PRIMARY KEY
    );

    INSERT INTO #MatchedEntries (entry_id)
    SELECT e.id
    FROM dbo.cms_entries e
    INNER JOIN dbo.cms_content_types ct ON e.content_type_id = ct.id
    INNER JOIN dbo.cms_entry_locales l ON l.entry_id = e.id AND l.locale = @locale
    WHERE e.site_id = @site_id
      AND ct.api_id = @content_type_api_id
      AND e.status = 'published'
      AND (@keyword IS NULL OR l.title LIKE N'%' + @keyword + N'%')
      AND (
          @total_filter_groups = 0
          OR (
              -- Đếm số nhóm bộ lọc mà bản ghi này thỏa mãn phải bằng tổng số nhóm bộ lọc được truyền vào
              SELECT COUNT(DISTINCT pf.filter_id)
              FROM #ParsedFilters pf
              INNER JOIN dbo.cms_entry_index_values idx 
                  ON idx.entry_id = e.id 
                  AND idx.field_key = pf.field_key
                  AND idx.locale IN ('all', @locale)
              WHERE 
                  -- 1. Lọc chọn nhiều giá trị (Checkbox Multi-select: OR bên trong nhóm)
                  (pf.op = 'in' AND idx.string_val IN (SELECT LOWER(value) FROM OPENJSON(pf.values_json)))
                  -- 2. Lọc khoảng số (Range Slider: Giá, Diện tích, Số phòng...)
                  OR (pf.op = 'range' 
                      AND (pf.min_val IS NULL OR idx.number_val >= pf.min_val)
                      AND (pf.max_val IS NULL OR idx.number_val <= pf.max_val))
                  -- 3. Lọc theo cây phân cấp (Danh mục cha lấy toàn bộ danh mục con)
                  OR (pf.op = 'hierarchy' AND idx.hierarchy_path LIKE pf.hierarchy_prefix + '%')
          ) = @total_filter_groups
      );

    /* ========================================================================
       RESULT SET 1: TRẢ VỀ DANH SÁCH BẢN GHI ĐÃ PHÂN TRANG & SẮP XẾP ĐỘNG
    ======================================================================== */
    SELECT 
        COUNT(*) OVER() AS total_records,
        e.id AS entry_id,
        l.title,
        l.slug,
        e.base_data,
        l.localized_data,
        l.seo_meta,
        e.published_at,
        sort_idx.number_val AS dynamic_sort_value
    FROM #MatchedEntries me
    INNER JOIN dbo.cms_entries e ON e.id = me.entry_id
    INNER JOIN dbo.cms_entry_locales l ON l.entry_id = e.id AND l.locale = @locale
    LEFT JOIN dbo.cms_entry_index_values sort_idx 
        ON sort_idx.entry_id = e.id 
        AND sort_idx.field_key = @sort_field 
        AND sort_idx.locale IN ('all', @locale)
    ORDER BY
        CASE WHEN @sort_field = 'published_at' AND @sort_dir = 'DESC' THEN e.published_at END DESC,
        CASE WHEN @sort_field = 'published_at' AND @sort_dir = 'ASC'  THEN e.published_at END ASC,
        CASE WHEN @sort_field = 'title'        AND @sort_dir = 'ASC'  THEN l.title END ASC,
        CASE WHEN @sort_field = 'title'        AND @sort_dir = 'DESC' THEN l.title END DESC,
        CASE WHEN @sort_field NOT IN ('published_at', 'title') AND @sort_dir = 'ASC'  THEN sort_idx.number_val END ASC,
        CASE WHEN @sort_field NOT IN ('published_at', 'title') AND @sort_dir = 'DESC' THEN sort_idx.number_val END DESC
    OFFSET (@page_index - 1) * @page_size ROWS
    FETCH NEXT @page_size ROWS ONLY;

    /* ========================================================================
       RESULT SET 2: TRẢ VỀ THỐNG KÊ SỐ LƯỢNG CHO THANH BỘ LỌC (FACET COUNTS)
    ======================================================================== */
    SELECT 
        idx.field_key,
        fd.display_label AS field_label,
        fd.filter_type,
        idx.string_val AS filter_value,
        MAX(idx.display_text) AS filter_display_text,
        COUNT(DISTINCT idx.entry_id) AS matching_count
    FROM #MatchedEntries me
    INNER JOIN dbo.cms_entry_index_values idx ON idx.entry_id = me.entry_id
    INNER JOIN dbo.cms_entries e ON e.id = me.entry_id
    INNER JOIN dbo.cms_field_definitions fd 
        ON fd.content_type_id = e.content_type_id 
        AND fd.field_key = idx.field_key
    WHERE fd.is_filterable = 1
      AND idx.string_val IS NOT NULL
      AND idx.locale IN ('all', @locale)
    GROUP BY idx.field_key, fd.display_label, fd.filter_type, fd.sort_order, idx.string_val
    ORDER BY fd.sort_order ASC, matching_count DESC;

    DROP TABLE #MatchedEntries;
    DROP TABLE #ParsedFilters;
END
GO
