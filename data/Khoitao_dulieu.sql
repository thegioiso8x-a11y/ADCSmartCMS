-- KHỞI TẠO DỮ LIỆU MẪU VÀ CHẠY THỬ DYNAMIC FILTER ENGINE
DECLARE @site_id UNIQUEIDENTIFIER = NEWID();
DECLARE @type_id UNIQUEIDENTIFIER = NEWID();
DECLARE @p1_id UNIQUEIDENTIFIER = NEWID();
DECLARE @p2_id UNIQUEIDENTIFIER = NEWID();

-- 1. Tạo Website mẫu
INSERT INTO dbo.cms_sites (id, site_code, site_name, primary_domain)
VALUES (@site_id, 'tech_store', N'Siêu thị Công nghệ ADC', 'tech.adccms.vn');

-- 2. Tạo Content Type động: 'product'
INSERT INTO dbo.cms_content_types (id, site_id, api_id, display_name, kind)
VALUES (@type_id, @site_id, 'product', N'Sản phẩm Công nghệ', 'collection');

-- 3. Định nghĩa 3 trường động có bật Bộ lọc (brand, features, sale_price)
INSERT INTO dbo.cms_field_definitions (content_type_id, field_key, display_label, field_type, is_localized, is_indexed, is_filterable, filter_type, sort_order)
VALUES 
(@type_id, 'brand', N'Thương hiệu', 'enumeration', 0, 1, 1, 'checkbox_multi', 1),
(@type_id, 'features', N'Tính năng nổi bật', 'multi_select', 0, 1, 1, 'checkbox_multi', 2),
(@type_id, 'sale_price', N'Giá khuyến mãi', 'decimal', 0, 1, 1, 'range_slider', 3);

-- 4. Thêm 2 sản phẩm có dữ liệu JSON động (kể cả mảng nhiều tính năng)
INSERT INTO dbo.cms_entries (id, site_id, content_type_id, status, published_at, base_data)
VALUES 
(@p1_id, @site_id, @type_id, 'published', SYSDATETIMEOFFSET(), N'{"brand": "Apple", "sale_price": 28990000, "features": ["5G", "AI Camera", "Sạc không dây"]}'),
(@p2_id, @site_id, @type_id, 'published', SYSDATETIMEOFFSET(), N'{"brand": "Samsung", "sale_price": 24500000, "features": ["5G", "Bút S-Pen", "Chống nước IP68"]}');

INSERT INTO dbo.cms_entry_locales (site_id, entry_id, locale, title, slug, localized_data)
VALUES 
(@site_id, @p1_id, 'vi', N'iPhone 16 Pro Max 256GB', 'iphone-16-pro-max-256gb', N'{"summary": "Chip A18 Pro mạnh mẽ"}'),
(@site_id, @p2_id, 'vi', N'Samsung Galaxy S25 Ultra', 'samsung-galaxy-s25-ultra', N'{"summary": "Tích hợp Galaxy AI toàn diện"}');

-- 5. Gọi Stored Procedure tự động bóc tách JSON sang bảng Index
EXEC dbo.usp_cms_sync_entry_indexes @entry_id = @p1_id;
EXEC dbo.usp_cms_sync_entry_indexes @entry_id = @p2_id;

-- 6. CHẠY THỬ BỘ LỌC ĐỘNG: Lọc sản phẩm có tính năng '5G' VÀ giá từ 20tr -> 30tr, sắp xếp theo giá tăng dần
EXEC dbo.usp_cms_dynamic_filter_entries
    @site_id = @site_id,
    @content_type_api_id = 'product',
    @locale = 'vi',
    @filters_json = N'[
        {"field": "features", "op": "in", "values": ["5g"]},
        {"field": "sale_price", "op": "range", "min": 20000000, "max": 30000000}
    ]',
    @sort_field = 'sale_price',
    @sort_dir = 'ASC',
    @page_index = 1,
    @page_size = 10;
