/* ============================================================================
   DỰ ÁN: ADC SMART & COMPOSABLE CMS
   HỆ QUẢN TRỊ CSDL: MICROSOFT SQL SERVER 2022 (COMPATIBILITY LEVEL 160)
   MÔ TẢ: Full Production Schema (Multi-site, Auto-Theme, Dynamic Modeling, 
          Faceted Filtering, Dynamic RBAC, Technical SEO & Pluggable E-Commerce)
============================================================================ */

USE master;
GO

IF DB_ID(N'ADC_SmartCMS') IS NULL
BEGIN
    CREATE DATABASE [ADC_SmartCMS];
END
GO

USE [ADC_SmartCMS];
GO

-- Đảm bảo bật Compatibility Level 160 (SQL Server 2022) để dùng ISJSON(..., OBJECT/ARRAY)
ALTER DATABASE [ADC_SmartCMS] SET COMPATIBILITY_LEVEL = 160;
GO

/* ============================================================================
   PHÂN KHU 1: ĐA WEBSITE & GIAO DIỆN TỰ ĐỘNG (MULTI-SITE & AUTO-THEME ENGINE)
============================================================================ */

-- 1. Bảng Kho Giao diện (Themes Repository)
IF OBJECT_ID(N'dbo.cms_themes', N'U') IS NULL
CREATE TABLE dbo.cms_themes (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_themes_id DEFAULT NEWSEQUENTIALID(),
    theme_code VARCHAR(100) NOT NULL,
    theme_name NVARCHAR(150) NOT NULL,
    version VARCHAR(20) NOT NULL CONSTRAINT DF_themes_version DEFAULT '1.0.0',
    assets_base_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500) NULL,
    
    -- Lưu biến CSS (:root variables) để đổi màu sắc/font chữ động trên Admin
    theme_variables NVARCHAR(MAX) NOT NULL CONSTRAINT DF_themes_vars DEFAULT N'{}'
        CONSTRAINT CK_themes_vars_json CHECK (ISJSON(theme_variables, OBJECT) = 1),
        
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_themes_created DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_cms_themes PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_cms_themes_code UNIQUE NONCLUSTERED (theme_code)
);
GO

-- 2. Bảng Khuôn mẫu HTML đã biên dịch (Compiled Liquid Templates)
IF OBJECT_ID(N'dbo.cms_theme_templates', N'U') IS NULL
CREATE TABLE dbo.cms_theme_templates (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_templates_id DEFAULT NEWSEQUENTIALID(),
    theme_id UNIQUEIDENTIFIER NOT NULL,
    template_key VARCHAR(100) NOT NULL,  -- 'layout_master', 'page_home', 'list_product', 'detail_product'
    template_type VARCHAR(30) NOT NULL,  -- 'layout', 'page', 'collection_list', 'collection_detail', 'block'
    
    compiled_html NVARCHAR(MAX) NOT NULL,
    extracted_schema NVARCHAR(MAX) NOT NULL CONSTRAINT DF_templates_schema DEFAULT N'{}'
        CONSTRAINT CK_templates_schema_json CHECK (ISJSON(extracted_schema, OBJECT) = 1),
        
    updated_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_templates_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_cms_theme_templates PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_templates_theme FOREIGN KEY (theme_id) REFERENCES dbo.cms_themes(id) ON DELETE CASCADE,
    CONSTRAINT UQ_theme_template_key UNIQUE NONCLUSTERED (theme_id, template_key)
);
GO

-- 3. Bảng Quản lý Danh sách Website / Thương hiệu (Multi-Site)
IF OBJECT_ID(N'dbo.cms_sites', N'U') IS NULL
CREATE TABLE dbo.cms_sites (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_sites_id DEFAULT NEWSEQUENTIALID(),
    site_code VARCHAR(50) NOT NULL,
    site_name NVARCHAR(150) NOT NULL,
    primary_domain VARCHAR(255) NOT NULL,
    additional_domains NVARCHAR(MAX) NULL,
    
    active_theme_id UNIQUEIDENTIFIER NULL,
    default_locale VARCHAR(10) NOT NULL CONSTRAINT DF_sites_def_locale DEFAULT 'vi',
    supported_locales VARCHAR(100) NOT NULL CONSTRAINT DF_sites_sup_locales DEFAULT 'vi,en',
    
    site_settings NVARCHAR(MAX) NOT NULL CONSTRAINT DF_sites_settings DEFAULT N'{}'
        CONSTRAINT CK_sites_settings_json CHECK (ISJSON(site_settings, OBJECT) = 1),
        
    is_active BIT NOT NULL CONSTRAINT DF_sites_active DEFAULT 1,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_sites_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_sites PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_sites_theme FOREIGN KEY (active_theme_id) REFERENCES dbo.cms_themes(id) ON DELETE SET NULL,
    CONSTRAINT UQ_cms_sites_code UNIQUE NONCLUSTERED (site_code),
    CONSTRAINT UQ_cms_sites_domain UNIQUE NONCLUSTERED (primary_domain)
);
GO

/* ============================================================================
   PHÂN KHU 2: ĐỊNH NGHĨA CẤU TRÚC ĐỘNG (META-SCHEMA / CONTROL PLANE)
============================================================================ */

-- 4. Bảng Định nghĩa Loại nội dung (Content Types & Blocks)
IF OBJECT_ID(N'dbo.cms_content_types', N'U') IS NULL
CREATE TABLE dbo.cms_content_types (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_content_types_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NULL, -- NULL = Dùng chung toàn hệ thống; Có giá trị = Riêng của Website đó
    api_id VARCHAR(100) NOT NULL,  -- 'product', 'article', 'project', 'hero_banner'
    display_name NVARCHAR(150) NOT NULL,
    kind VARCHAR(30) NOT NULL CONSTRAINT DF_content_types_kind DEFAULT 'collection', 
    -- 'collection', 'single', 'component'
    
    description NVARCHAR(500) NULL,
    is_localized BIT NOT NULL CONSTRAINT DF_content_types_localized DEFAULT 1,
    enable_versioning BIT NOT NULL CONSTRAINT DF_content_types_version DEFAULT 1,
    enable_workflow BIT NOT NULL CONSTRAINT DF_content_types_workflow DEFAULT 0,
    
    settings NVARCHAR(MAX) NOT NULL CONSTRAINT DF_content_types_settings DEFAULT N'{}'
        CONSTRAINT CK_content_types_settings_json CHECK (ISJSON(settings, OBJECT) = 1),
        
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_content_types_created DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_content_types_updated DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_content_types PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_content_types_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE NO ACTION
);
GO

CREATE UNIQUE NONCLUSTERED INDEX IX_cms_content_types_site_api 
ON dbo.cms_content_types (site_id, api_id);
GO

-- 5. Bảng Định nghĩa Trường dữ liệu động & Cấu hình Bộ lọc (Custom Fields)
IF OBJECT_ID(N'dbo.cms_field_definitions', N'U') IS NULL
CREATE TABLE dbo.cms_field_definitions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_field_defs_id DEFAULT NEWSEQUENTIALID(),
    content_type_id UNIQUEIDENTIFIER NOT NULL,
    
    field_key VARCHAR(100) NOT NULL,
    display_label NVARCHAR(150) NOT NULL,
    field_type VARCHAR(50) NOT NULL, 
    -- 'string', 'text', 'rich_text', 'integer', 'decimal', 'boolean', 'datetime', 
    -- 'enumeration', 'multi_select', 'media', 'relation', 'dynamic_zone'
    
    is_required BIT NOT NULL CONSTRAINT DF_field_defs_req DEFAULT 0,
    is_unique BIT NOT NULL CONSTRAINT DF_field_defs_uniq DEFAULT 0,
    is_localized BIT NOT NULL CONSTRAINT DF_field_defs_loc DEFAULT 0,
    is_searchable BIT NOT NULL CONSTRAINT DF_field_defs_search DEFAULT 1,
    is_indexed BIT NOT NULL CONSTRAINT DF_field_defs_idx DEFAULT 0,
    
    -- Cấu hình Bộ lọc Động (Dynamic Faceted Filter)
    is_filterable BIT NOT NULL CONSTRAINT DF_field_defs_filterable DEFAULT 0,
    filter_type VARCHAR(30) NULL, -- 'checkbox_multi', 'range_slider', 'color_swatch', 'radio_single', 'hierarchy'
    
    default_value NVARCHAR(MAX) NULL,
    validation_rules NVARCHAR(MAX) NOT NULL CONSTRAINT DF_field_defs_val DEFAULT N'{}'
        CONSTRAINT CK_field_defs_validation_json CHECK (ISJSON(validation_rules, OBJECT) = 1),
    relation_config NVARCHAR(MAX) NULL
        CONSTRAINT CK_field_defs_relation_json CHECK (relation_config IS NULL OR ISJSON(relation_config, OBJECT) = 1),
    ui_config NVARCHAR(MAX) NOT NULL CONSTRAINT DF_field_defs_ui DEFAULT N'{}'
        CONSTRAINT CK_field_defs_ui_json CHECK (ISJSON(ui_config, OBJECT) = 1),
        
    sort_order INT NOT NULL CONSTRAINT DF_field_defs_sort DEFAULT 0,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_field_defs_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_field_definitions PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_field_defs_content_type FOREIGN KEY (content_type_id) 
        REFERENCES dbo.cms_content_types(id) ON DELETE CASCADE,
    CONSTRAINT UQ_field_defs_type_key UNIQUE NONCLUSTERED (content_type_id, field_key)
);
GO

/* ============================================================================
   PHÂN KHU 3: LƯU TRỮ DỮ LIỆU ĐỘNG & BỘ LỌC SIÊU TỐC (DATA PLANE)
============================================================================ */

-- 6. Bảng Bản ghi gốc (Entries)
IF OBJECT_ID(N'dbo.cms_entries', N'U') IS NULL
CREATE TABLE dbo.cms_entries (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_entries_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    content_type_id UNIQUEIDENTIFIER NOT NULL,
    
    status VARCHAR(30) NOT NULL CONSTRAINT DF_entries_status DEFAULT 'draft',
    -- 'draft', 'in_review', 'approved', 'scheduled', 'published', 'archived'
    
    base_data NVARCHAR(MAX) NOT NULL CONSTRAINT DF_entries_base_data DEFAULT N'{}'
        CONSTRAINT CK_entries_base_data_json CHECK (ISJSON(base_data, OBJECT) = 1),
        
    published_at DATETIMEOFFSET(7) NULL,
    scheduled_at DATETIMEOFFSET(7) NULL,
    created_by UNIQUEIDENTIFIER NULL,
    updated_by UNIQUEIDENTIFIER NULL,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_entries_created DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_entries_updated DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_entries PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_entries_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE NO ACTION,
    CONSTRAINT FK_entries_content_type FOREIGN KEY (content_type_id) REFERENCES dbo.cms_content_types(id) ON DELETE NO ACTION
);
GO

CREATE NONCLUSTERED INDEX IX_cms_entries_site_type_status 
ON dbo.cms_entries (site_id, content_type_id, status, published_at DESC);
GO

-- 7. Bảng Nội dung Đa ngôn ngữ & SEO (Localized Data)
IF OBJECT_ID(N'dbo.cms_entry_locales', N'U') IS NULL
CREATE TABLE dbo.cms_entry_locales (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_entry_locales_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    entry_id UNIQUEIDENTIFIER NOT NULL,
    locale VARCHAR(10) NOT NULL CONSTRAINT DF_entry_locales_locale DEFAULT 'vi',
    
    title NVARCHAR(500) NULL,
    slug VARCHAR(500) NULL,
    
    localized_data NVARCHAR(MAX) NOT NULL CONSTRAINT DF_entry_locales_data DEFAULT N'{}'
        CONSTRAINT CK_entry_locales_data_json CHECK (ISJSON(localized_data, OBJECT) = 1),
        
    seo_meta NVARCHAR(MAX) NOT NULL CONSTRAINT DF_entry_locales_seo DEFAULT N'{}'
        CONSTRAINT CK_entry_locales_seo_json CHECK (ISJSON(seo_meta, OBJECT) = 1),
        
    -- Các cột vật lý phục vụ Technical SEO & Sitemap.xml tốc độ cao
    is_indexable BIT NOT NULL CONSTRAINT DF_locales_indexable DEFAULT 1,
    sitemap_priority DECIMAL(2,1) NOT NULL CONSTRAINT DF_locales_priority DEFAULT 0.8,
    sitemap_changefreq VARCHAR(20) NOT NULL CONSTRAINT DF_locales_freq DEFAULT 'weekly',
    
    updated_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_entry_locales_updated DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_entry_locales PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_entry_locales_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE NO ACTION,
    CONSTRAINT FK_entry_locales_entry FOREIGN KEY (entry_id) REFERENCES dbo.cms_entries(id) ON DELETE CASCADE,
    CONSTRAINT UQ_entry_locales_entry_lang UNIQUE NONCLUSTERED (entry_id, locale)
);
GO

-- Unique Index cho phép các Website khác nhau có cùng đường dẫn Slug
CREATE UNIQUE NONCLUSTERED INDEX IX_entry_locales_site_slug 
ON dbo.cms_entry_locales (site_id, locale, slug) 
WHERE slug IS NOT NULL;
GO

-- Index xuất Sitemap.xml tức thời
CREATE NONCLUSTERED INDEX IX_entry_locales_sitemap 
ON dbo.cms_entry_locales (site_id, locale, is_indexable, updated_at DESC) 
INCLUDE (slug, sitemap_priority, sitemap_changefreq)
WHERE is_indexable = 1 AND slug IS NOT NULL;
GO

-- 8. Bảng Chỉ mục Tìm kiếm Động & Bộ lọc Đa chiều (Faceted Filter Index)
IF OBJECT_ID(N'dbo.cms_entry_index_values', N'U') IS NULL
CREATE TABLE dbo.cms_entry_index_values (
    id BIGINT IDENTITY(1,1) NOT NULL,
    entry_id UNIQUEIDENTIFIER NOT NULL,
    locale VARCHAR(10) NOT NULL CONSTRAINT DF_idx_val_locale DEFAULT 'all', -- 'all' cho base_data, hoặc 'vi', 'en'
    field_key VARCHAR(100) NOT NULL,
    
    string_val NVARCHAR(450) NULL,
    display_text NVARCHAR(250) NULL,  -- Tên hiển thị trên giao diện Bộ lọc (VD: 'Apple', '8GB RAM')
    number_val DECIMAL(18,4) NULL,
    date_val DATETIMEOFFSET(7) NULL,
    bool_val BIT NULL,
    hierarchy_path VARCHAR(500) NULL, -- Đường dẫn cây danh mục: '/dien-tu/dien-thoai/'
    
    CONSTRAINT PK_cms_entry_index_values PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_index_values_entry FOREIGN KEY (entry_id) REFERENCES dbo.cms_entries(id) ON DELETE CASCADE
);
GO

CREATE NONCLUSTERED INDEX IX_index_val_faceted 
ON dbo.cms_entry_index_values (field_key, locale, string_val, entry_id) 
INCLUDE (display_text) 
WHERE string_val IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX IX_index_val_number 
ON dbo.cms_entry_index_values (field_key, number_val, entry_id) 
WHERE number_val IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX IX_index_val_date 
ON dbo.cms_entry_index_values (field_key, date_val, entry_id) 
WHERE date_val IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX IX_index_val_hierarchy 
ON dbo.cms_entry_index_values (field_key, hierarchy_path) 
INCLUDE (entry_id) 
WHERE hierarchy_path IS NOT NULL;
GO

-- 9. Bảng Quan hệ Vạn năng giữa các Bản ghi (1-1, 1-N, N-N)
IF OBJECT_ID(N'dbo.cms_entry_relations', N'U') IS NULL
CREATE TABLE dbo.cms_entry_relations (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_relations_id DEFAULT NEWSEQUENTIALID(),
    source_entry_id UNIQUEIDENTIFIER NOT NULL,
    target_entry_id UNIQUEIDENTIFIER NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_relations_sort DEFAULT 0,
    relation_meta NVARCHAR(MAX) NOT NULL CONSTRAINT DF_relations_meta DEFAULT N'{}'
        CONSTRAINT CK_relations_meta_json CHECK (ISJSON(relation_meta, OBJECT) = 1),
        
    CONSTRAINT PK_cms_entry_relations PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_relations_source FOREIGN KEY (source_entry_id) REFERENCES dbo.cms_entries(id) ON DELETE CASCADE,
    CONSTRAINT FK_relations_target FOREIGN KEY (target_entry_id) REFERENCES dbo.cms_entries(id) ON DELETE NO ACTION,
    CONSTRAINT UQ_entry_relations UNIQUE NONCLUSTERED (source_entry_id, target_entry_id, field_key)
);
GO

CREATE NONCLUSTERED INDEX IX_relations_target_lookup 
ON dbo.cms_entry_relations (target_entry_id, field_key, source_entry_id);
GO

-- 10. Bảng Khối Giao diện Động (Dynamic Zone / Page Builder)
IF OBJECT_ID(N'dbo.cms_entry_blocks', N'U') IS NULL
CREATE TABLE dbo.cms_entry_blocks (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_blocks_id DEFAULT NEWSEQUENTIALID(),
    entry_id UNIQUEIDENTIFIER NOT NULL,
    locale VARCHAR(10) NOT NULL CONSTRAINT DF_blocks_locale DEFAULT 'vi',
    zone_key VARCHAR(100) NOT NULL CONSTRAINT DF_blocks_zone DEFAULT 'main_layout',
    component_type_id UNIQUEIDENTIFIER NOT NULL,
    
    block_data NVARCHAR(MAX) NOT NULL CONSTRAINT DF_blocks_data DEFAULT N'{}'
        CONSTRAINT CK_entry_blocks_json CHECK (ISJSON(block_data, OBJECT) = 1),
    sort_order INT NOT NULL CONSTRAINT DF_blocks_sort DEFAULT 0,
    is_visible BIT NOT NULL CONSTRAINT DF_blocks_visible DEFAULT 1,
    
    CONSTRAINT PK_cms_entry_blocks PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_blocks_entry FOREIGN KEY (entry_id) REFERENCES dbo.cms_entries(id) ON DELETE CASCADE,
    CONSTRAINT FK_blocks_component_type FOREIGN KEY (component_type_id) REFERENCES dbo.cms_content_types(id) ON DELETE NO ACTION
);
GO

CREATE NONCLUSTERED INDEX IX_entry_blocks_lookup 
ON dbo.cms_entry_blocks (entry_id, locale, zone_key, sort_order);
GO

-- 11. Bảng Lịch sử Phiên bản & Khôi phục (Versioning & Rollback)
IF OBJECT_ID(N'dbo.cms_entry_versions', N'U') IS NULL
CREATE TABLE dbo.cms_entry_versions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_versions_id DEFAULT NEWSEQUENTIALID(),
    entry_id UNIQUEIDENTIFIER NOT NULL,
    locale VARCHAR(10) NOT NULL CONSTRAINT DF_versions_locale DEFAULT 'vi',
    version_number INT NOT NULL,
    
    snapshot_payload NVARCHAR(MAX) NOT NULL
        CONSTRAINT CK_versions_payload_json CHECK (ISJSON(snapshot_payload, OBJECT) = 1),
    change_summary NVARCHAR(500) NULL,
    created_by UNIQUEIDENTIFIER NULL,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_versions_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_entry_versions PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_versions_entry FOREIGN KEY (entry_id) REFERENCES dbo.cms_entries(id) ON DELETE CASCADE,
    CONSTRAINT UQ_entry_versions_num UNIQUE NONCLUSTERED (entry_id, locale, version_number)
);
GO

/* ============================================================================
   PHÂN KHU 4: PHÂN QUYỀN ĐỘNG (DYNAMIC RBAC) & KỸ THUẬT SEO (TECHNICAL SEO)
============================================================================ */

-- 12. Bảng Người dùng & Quản trị viên (Users)
IF OBJECT_ID(N'dbo.cms_users', N'U') IS NULL
CREATE TABLE dbo.cms_users (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_users_id DEFAULT NEWSEQUENTIALID(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(500) NOT NULL,
    full_name NVARCHAR(150) NOT NULL,
    avatar_url VARCHAR(500) NULL,
    is_super_admin BIT NOT NULL CONSTRAINT DF_users_super DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_users_active DEFAULT 1,
    last_login_at DATETIMEOFFSET(7) NULL,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_users_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_users PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_cms_users_email UNIQUE NONCLUSTERED (email)
);
GO

-- 13. Bảng Vai trò (Roles)
IF OBJECT_ID(N'dbo.cms_roles', N'U') IS NULL
CREATE TABLE dbo.cms_roles (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_roles_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NULL, -- NULL = Role toàn hệ thống; Có giá trị = Role riêng của Site
    role_code VARCHAR(50) NOT NULL,
    role_name NVARCHAR(150) NOT NULL,
    description NVARCHAR(500) NULL,
    
    CONSTRAINT PK_cms_roles PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_roles_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE CASCADE
);
GO

-- 14. Bảng Trung gian Gán User vào Role (User Roles)
IF OBJECT_ID(N'dbo.cms_user_roles', N'U') IS NULL
CREATE TABLE dbo.cms_user_roles (
    user_id UNIQUEIDENTIFIER NOT NULL,
    role_id UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_cms_user_roles PRIMARY KEY CLUSTERED (user_id, role_id),
    CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id) REFERENCES dbo.cms_users(id) ON DELETE CASCADE,
    CONSTRAINT FK_user_roles_role FOREIGN KEY (role_id) REFERENCES dbo.cms_roles(id) ON DELETE CASCADE
);
GO

-- 15. Bảng Ma trận Phân quyền Động tới từng Field (Dynamic Permissions)
IF OBJECT_ID(N'dbo.cms_permissions', N'U') IS NULL
CREATE TABLE dbo.cms_permissions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_perms_id DEFAULT NEWSEQUENTIALID(),
    role_id UNIQUEIDENTIFIER NOT NULL,
    content_type_id UNIQUEIDENTIFIER NULL, -- NULL = Mọi Content Type
    
    action VARCHAR(50) NOT NULL, -- 'create', 'read', 'update', 'delete', 'publish', 'manage_schema'
    scope VARCHAR(30) NOT NULL CONSTRAINT DF_perms_scope DEFAULT 'all', -- 'all', 'own'
    
    -- Kiểm soát quyền đến từng trường dữ liệu (Mảng JSON tên trường)
    allowed_fields NVARCHAR(MAX) NULL 
        CONSTRAINT CK_permissions_fields_json CHECK (allowed_fields IS NULL OR ISJSON(allowed_fields, ARRAY) = 1),
        
    -- Điều kiện động nâng cao (ABAC)
    conditions NVARCHAR(MAX) NULL 
        CONSTRAINT CK_permissions_cond_json CHECK (conditions IS NULL OR ISJSON(conditions, OBJECT) = 1),
        
    CONSTRAINT PK_cms_permissions PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_perms_role FOREIGN KEY (role_id) REFERENCES dbo.cms_roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_perms_content_type FOREIGN KEY (content_type_id) REFERENCES dbo.cms_content_types(id) ON DELETE NO ACTION
);
GO

-- 16. Bảng Quản lý Điều hướng 301/302 Tự động (SEO Redirects)
IF OBJECT_ID(N'dbo.cms_seo_redirects', N'U') IS NULL
CREATE TABLE dbo.cms_seo_redirects (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_redirects_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    old_path NVARCHAR(500) NOT NULL,
    new_path NVARCHAR(500) NOT NULL,
    status_code SMALLINT NOT NULL CONSTRAINT DF_redirects_code DEFAULT 301,
    is_regex BIT NOT NULL CONSTRAINT DF_redirects_regex DEFAULT 0,
    hits_count BIGINT NOT NULL CONSTRAINT DF_redirects_hits DEFAULT 0,
    last_hit_at DATETIMEOFFSET(7) NULL,
    note NVARCHAR(255) NULL,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_redirects_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_seo_redirects PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_redirects_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE CASCADE,
    CONSTRAINT UQ_seo_redirects_old_path UNIQUE NONCLUSTERED (site_id, old_path)
);
GO

/* ============================================================================
   PHÂN KHU 5: MÔ-ĐUN THƯƠNG MẠI ĐIỆN TỬ LẮP GHÉP (PLUGGABLE E-COMMERCE)
============================================================================ */

-- 17. Bảng Biến thể Sản phẩm & Tồn kho (SKU Variants & Inventory)
IF OBJECT_ID(N'dbo.cms_ecommerce_variants', N'U') IS NULL
CREATE TABLE dbo.cms_ecommerce_variants (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_variants_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    entry_id UNIQUEIDENTIFIER NOT NULL,
    
    sku_code VARCHAR(100) NOT NULL,
    barcode VARCHAR(100) NULL,
    
    price DECIMAL(18,2) NOT NULL CONSTRAINT DF_variants_price DEFAULT 0,
    sale_price DECIMAL(18,2) NOT NULL CONSTRAINT DF_variants_sale_price DEFAULT 0,
    cost_price DECIMAL(18,2) NULL,
    
    stock_quantity INT NOT NULL CONSTRAINT DF_variants_stock DEFAULT 0,
    reserved_quantity INT NOT NULL CONSTRAINT DF_variants_reserved DEFAULT 0,
    track_inventory BIT NOT NULL CONSTRAINT DF_variants_track DEFAULT 1,
    
    variant_options NVARCHAR(MAX) NOT NULL CONSTRAINT DF_variants_options DEFAULT N'{}'
        CONSTRAINT CK_variants_options_json CHECK (ISJSON(variant_options, OBJECT) = 1),
        
    image_url VARCHAR(500) NULL,
    weight_gram INT NOT NULL CONSTRAINT DF_variants_weight DEFAULT 0,
    is_default BIT NOT NULL CONSTRAINT DF_variants_default DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_variants_active DEFAULT 1,
    
    CONSTRAINT PK_cms_ecommerce_variants PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_variants_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE NO ACTION,
    CONSTRAINT FK_variants_entry FOREIGN KEY (entry_id) REFERENCES dbo.cms_entries(id) ON DELETE CASCADE,
    CONSTRAINT UQ_variants_site_sku UNIQUE NONCLUSTERED (site_id, sku_code)
);
GO

CREATE NONCLUSTERED INDEX IX_variants_entry_price 
ON dbo.cms_ecommerce_variants (entry_id, is_active, sale_price) 
INCLUDE (stock_quantity, reserved_quantity, sku_code, is_default);
GO

-- 18. Bảng Mã Giảm giá & Chương trình Khuyến mãi (Promotions)
IF OBJECT_ID(N'dbo.cms_ecommerce_promotions', N'U') IS NULL
CREATE TABLE dbo.cms_ecommerce_promotions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_promos_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    coupon_code VARCHAR(50) NOT NULL,
    title NVARCHAR(250) NOT NULL,
    discount_type VARCHAR(20) NOT NULL, -- 'percentage', 'fixed_amount', 'free_shipping'
    discount_value DECIMAL(18,2) NOT NULL,
    max_discount_amount DECIMAL(18,2) NULL,
    min_order_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_promos_min_order DEFAULT 0,
    usage_limit INT NULL,
    used_count INT NOT NULL CONSTRAINT DF_promos_used DEFAULT 0,
    start_at DATETIMEOFFSET(7) NOT NULL,
    end_at DATETIMEOFFSET(7) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_promos_active DEFAULT 1,
    
    CONSTRAINT PK_cms_ecommerce_promotions PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_promos_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE CASCADE,
    CONSTRAINT UQ_promotions_site_code UNIQUE NONCLUSTERED (site_id, coupon_code)
);
GO

-- 19. Bảng Đơn hàng (Orders)
IF OBJECT_ID(N'dbo.cms_ecommerce_orders', N'U') IS NULL
CREATE TABLE dbo.cms_ecommerce_orders (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_orders_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    order_code VARCHAR(50) NOT NULL,
    customer_id UNIQUEIDENTIFIER NULL,
    
    order_status VARCHAR(30) NOT NULL CONSTRAINT DF_orders_status DEFAULT 'pending',
    payment_status VARCHAR(30) NOT NULL CONSTRAINT DF_orders_pay_status DEFAULT 'unpaid',
    payment_method VARCHAR(50) NOT NULL CONSTRAINT DF_orders_pay_method DEFAULT 'cod',
    
    shipping_info NVARCHAR(MAX) NOT NULL
        CONSTRAINT CK_orders_shipping_json CHECK (ISJSON(shipping_info, OBJECT) = 1),
        
    subtotal_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_orders_subtotal DEFAULT 0,
    discount_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_orders_discount DEFAULT 0,
    shipping_fee DECIMAL(18,2) NOT NULL CONSTRAINT DF_orders_ship_fee DEFAULT 0,
    tax_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_orders_tax DEFAULT 0,
    total_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_orders_total DEFAULT 0,
    
    coupon_code VARCHAR(50) NULL,
    customer_note NVARCHAR(500) NULL,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_orders_created DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_orders_updated DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_ecommerce_orders PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_orders_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE NO ACTION,
    CONSTRAINT UQ_orders_site_code UNIQUE NONCLUSTERED (site_id, order_code)
);
GO

-- 20. Bảng Chi tiết Dòng Sản phẩm trong Đơn hàng (Order Items)
IF OBJECT_ID(N'dbo.cms_ecommerce_order_items', N'U') IS NULL
CREATE TABLE dbo.cms_ecommerce_order_items (
    id BIGINT IDENTITY(1,1) NOT NULL,
    order_id UNIQUEIDENTIFIER NOT NULL,
    entry_id UNIQUEIDENTIFIER NOT NULL,
    variant_id UNIQUEIDENTIFIER NOT NULL,
    
    product_title NVARCHAR(500) NOT NULL,
    sku_code VARCHAR(100) NOT NULL,
    variant_label NVARCHAR(250) NULL,
    thumbnail_url VARCHAR(500) NULL,
    
    quantity INT NOT NULL CONSTRAINT CK_order_items_qty CHECK (quantity > 0),
    unit_price DECIMAL(18,2) NOT NULL,
    total_price AS (quantity * unit_price) PERSISTED,
    
    CONSTRAINT PK_cms_ecommerce_order_items PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_order_items_order FOREIGN KEY (order_id) REFERENCES dbo.cms_ecommerce_orders(id) ON DELETE CASCADE
);
GO

/* ============================================================================
   BỔ SUNG PHÂN HỆ 3: QUẢN LÝ MENU ĐA CẤP & FORM THU THẬP KHÁCH HÀNG
============================================================================ */

-- 21. Bảng Định nghĩa Vùng Menu (Menus)
IF OBJECT_ID(N'dbo.cms_menus', N'U') IS NULL
CREATE TABLE dbo.cms_menus (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_menus_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    menu_code VARCHAR(100) NOT NULL,     -- Khớp với thuộc tính data-cms-menu="primary_menu" trong HTML
    menu_name NVARCHAR(150) NOT NULL,    -- VD: 'Menu Chính Đầu Trang', 'Menu Chân Trang'
    is_active BIT NOT NULL CONSTRAINT DF_menus_active DEFAULT 1,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_menus_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_menus PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_menus_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE CASCADE,
    CONSTRAINT UQ_menus_site_code UNIQUE NONCLUSTERED (site_id, menu_code)
);
GO

-- 22. Bảng Các Mục Menu Đa cấp (Menu Items - Hỗ trợ Mega Menu & Đa ngôn ngữ)
IF OBJECT_ID(N'dbo.cms_menu_items', N'U') IS NULL
CREATE TABLE dbo.cms_menu_items (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_menu_items_id DEFAULT NEWSEQUENTIALID(),
    menu_id UNIQUEIDENTIFIER NOT NULL,
    parent_id UNIQUEIDENTIFIER NULL,     -- NULL = Mục cấp 1; Có giá trị = Mục con
    
    -- Lưu tên hiển thị theo đa ngôn ngữ, VD: {"vi": "Sản phẩm", "en": "Products"}
    title_locales NVARCHAR(MAX) NOT NULL CONSTRAINT DF_menu_items_title DEFAULT N'{}'
        CONSTRAINT CK_menu_items_title_json CHECK (ISJSON(title_locales, OBJECT) = 1),
        
    link_type VARCHAR(30) NOT NULL CONSTRAINT DF_menu_items_type DEFAULT 'custom', 
    -- 'entry' (Trỏ tới 1 bài viết/trang động), 'collection' (Trỏ tới trang danh sách), 'custom' (URL tự nhập)
    
    -- Nếu trỏ tới 1 bản ghi trong cms_entries: Khi bản ghi đổi slug, Menu tự động đổi URL theo!
    target_entry_id UNIQUEIDENTIFIER NULL,
    custom_url NVARCHAR(500) NULL,
    target_blank BIT NOT NULL CONSTRAINT DF_menu_items_blank DEFAULT 0, -- 1 = Mở tab mới (_blank)
    icon_class VARCHAR(100) NULL,
    
    hierarchy_path VARCHAR(500) NULL,    -- VD: '/1/4/12/' giúp sắp xếp cây Menu đa cấp không cần đệ quy chậm
    sort_order INT NOT NULL CONSTRAINT DF_menu_items_sort DEFAULT 0,
    is_visible BIT NOT NULL CONSTRAINT DF_menu_items_visible DEFAULT 1,
    
    CONSTRAINT PK_cms_menu_items PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_menu_items_menu FOREIGN KEY (menu_id) REFERENCES dbo.cms_menus(id) ON DELETE CASCADE,
    CONSTRAINT FK_menu_items_parent FOREIGN KEY (parent_id) REFERENCES dbo.cms_menu_items(id) ON DELETE NO ACTION,
    CONSTRAINT FK_menu_items_entry FOREIGN KEY (target_entry_id) REFERENCES dbo.cms_entries(id) ON DELETE SET NULL
);
GO

CREATE NONCLUSTERED INDEX IX_menu_items_lookup 
ON dbo.cms_menu_items (menu_id, is_visible, sort_order);
GO

-- 23. Bảng Định nghĩa Form Động (Dynamic Forms - Bóc tách từ <form data-cms-form="...">)
IF OBJECT_ID(N'dbo.cms_forms', N'U') IS NULL
CREATE TABLE dbo.cms_forms (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_forms_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    form_code VARCHAR(100) NOT NULL,     -- Khớp với data-cms-form="contact_form", "quote_request"
    form_name NVARCHAR(150) NOT NULL,
    
    -- Cấu trúc các trường input bóc tách từ HTML: [{"name": "full_name", "type": "text", "required": true}, ...]
    fields_schema NVARCHAR(MAX) NOT NULL CONSTRAINT DF_forms_schema DEFAULT N'[]'
        CONSTRAINT CK_forms_schema_json CHECK (ISJSON(fields_schema, ARRAY) = 1),
        
    -- Cấu hình bắn thông báo tự động: {"emails": ["sale@abc.com"], "telegram_chat_id": "...", "zalo_webhook": "..."}
    notification_config NVARCHAR(MAX) NOT NULL CONSTRAINT DF_forms_notify DEFAULT N'{}'
        CONSTRAINT CK_forms_notify_json CHECK (ISJSON(notification_config, OBJECT) = 1),
        
    success_message_locales NVARCHAR(MAX) NOT NULL CONSTRAINT DF_forms_msg DEFAULT N'{"vi": "Cảm ơn bạn đã gửi thông tin!"}'
        CONSTRAINT CK_forms_msg_json CHECK (ISJSON(success_message_locales, OBJECT) = 1),
        
    is_active BIT NOT NULL CONSTRAINT DF_forms_active DEFAULT 1,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_forms_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_forms PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_forms_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE CASCADE,
    CONSTRAINT UQ_forms_site_code UNIQUE NONCLUSTERED (site_id, form_code)
);
GO

-- 24. Bảng Lưu Dữ liệu Khách hàng Gửi từ Form (Form Submissions / Leads)
IF OBJECT_ID(N'dbo.cms_form_submissions', N'U') IS NULL
CREATE TABLE dbo.cms_form_submissions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_submissions_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    form_id UNIQUEIDENTIFIER NOT NULL,
    
    -- Toàn bộ dữ liệu khách nhập: {"full_name": "Nguyễn Văn A", "phone": "090...", "service": "Tư vấn thiết kế"}
    submission_data NVARCHAR(MAX) NOT NULL
        CONSTRAINT CK_submissions_data_json CHECK (ISJSON(submission_data, OBJECT) = 1),
        
    -- Trạng thái chăm sóc khách hàng (Mini-CRM)
    lead_status VARCHAR(30) NOT NULL CONSTRAINT DF_submissions_status DEFAULT 'new', 
    -- 'new', 'contacted', 'qualified', 'closed', 'spam'
    
    assigned_to UNIQUEIDENTIFIER NULL,   -- Nhân viên sale phụ trách xử lý
    staff_note NVARCHAR(1000) NULL,
    
    -- Lưu nguồn truy cập (UTM Source, Campaign, Page URL nơi khách bấm gửi, IP, UserAgent)
    tracking_metadata NVARCHAR(MAX) NOT NULL CONSTRAINT DF_submissions_track DEFAULT N'{}'
        CONSTRAINT CK_submissions_track_json CHECK (ISJSON(tracking_metadata, OBJECT) = 1),
        
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_submissions_created DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_submissions_updated DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_form_submissions PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_submissions_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE NO ACTION,
    CONSTRAINT FK_submissions_form FOREIGN KEY (form_id) REFERENCES dbo.cms_forms(id) ON DELETE CASCADE,
    CONSTRAINT FK_submissions_user FOREIGN KEY (assigned_to) REFERENCES dbo.cms_users(id) ON DELETE SET NULL
);
GO

CREATE NONCLUSTERED INDEX IX_form_submissions_filter 
ON dbo.cms_form_submissions (site_id, form_id, lead_status, created_at DESC);
GO

/* ============================================================================
   BỔ SUNG PHÂN HỆ 5: QUẢN LÝ TÀI SẢN SỐ THÔNG MINH (SMART DAM & MEDIA LIBRARY)
============================================================================ */

-- 25. Bảng Quản lý Cây Thư mục Media (Media Folders)
IF OBJECT_ID(N'dbo.cms_media_folders', N'U') IS NULL
CREATE TABLE dbo.cms_media_folders (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_media_folders_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    parent_id UNIQUEIDENTIFIER NULL,
    folder_name NVARCHAR(150) NOT NULL,
    folder_path VARCHAR(500) NOT NULL,   -- VD: '/san-pham/iphone-16/'
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_media_folders_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_media_folders PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_media_folders_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE CASCADE,
    CONSTRAINT FK_media_folders_parent FOREIGN KEY (parent_id) REFERENCES dbo.cms_media_folders(id) ON DELETE NO ACTION
);
GO

-- 26. Bảng Quản lý Tập trung Hình ảnh, Video & Tài liệu (Media Assets)
IF OBJECT_ID(N'dbo.cms_media_assets', N'U') IS NULL
CREATE TABLE dbo.cms_media_assets (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_media_assets_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    folder_id UNIQUEIDENTIFIER NULL,
    
    file_name NVARCHAR(255) NOT NULL,
    original_url VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,     -- 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4'
    file_ext VARCHAR(20) NOT NULL,
    file_size_bytes BIGINT NOT NULL CONSTRAINT DF_media_size DEFAULT 0,
    
    -- Kích thước ảnh & các phiên bản đã tự động nén sang WebP / AVIF / Thumbnail
    width INT NULL,
    height INT NULL,
    thumb_url VARCHAR(500) NULL,
    webp_url VARCHAR(500) NULL,
    avif_url VARCHAR(500) NULL,
    
    -- Tọa độ tâm ảnh thông minh (Smart Focal Point Cropping): {"x": 0.5, "y": 0.5}
    focal_point NVARCHAR(100) NOT NULL CONSTRAINT DF_media_focal DEFAULT N'{"x":0.5,"y":0.5}'
        CONSTRAINT CK_media_focal_json CHECK (ISJSON(focal_point, OBJECT) = 1),
        
    -- SEO Hình ảnh đa ngôn ngữ: {"vi": "Ảnh chụp iPhone 16", "en": "iPhone 16 photo"}
    alt_text_locales NVARCHAR(MAX) NOT NULL CONSTRAINT DF_media_alt DEFAULT N'{}'
        CONSTRAINT CK_media_alt_json CHECK (ISJSON(alt_text_locales, OBJECT) = 1),
        
    file_hash VARCHAR(64) NULL,          -- Mã băm SHA-256 giúp phát hiện ảnh tải trùng lặp
    uploaded_by UNIQUEIDENTIFIER NULL,
    created_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_media_created DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_media_assets PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_media_assets_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE NO ACTION,
    CONSTRAINT FK_media_assets_folder FOREIGN KEY (folder_id) REFERENCES dbo.cms_media_folders(id) ON DELETE SET NULL,
    CONSTRAINT FK_media_assets_user FOREIGN KEY (uploaded_by) REFERENCES dbo.cms_users(id) ON DELETE SET NULL
);
GO

CREATE NONCLUSTERED INDEX IX_media_assets_site_folder 
ON dbo.cms_media_assets (site_id, folder_id, created_at DESC) 
INCLUDE (file_name, mime_type, thumb_url, webp_url, file_size_bytes);
GO

/* ============================================================================
   BỔ SUNG PHÂN HỆ 7: QUẢN LÝ CẤU HÌNH AI & PROMPT TEMPLATES (AI SETTINGS)
============================================================================ */

-- 27. Bảng Cấu hình AI & Kiểm soát Hạn mức Token theo từng Website
IF OBJECT_ID(N'dbo.cms_ai_settings', N'U') IS NULL
CREATE TABLE dbo.cms_ai_settings (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ai_settings_id DEFAULT NEWSEQUENTIALID(),
    site_id UNIQUEIDENTIFIER NOT NULL,
    
    provider VARCHAR(50) NOT NULL CONSTRAINT DF_ai_provider DEFAULT 'gemini', -- 'gemini', 'openai', 'anthropic'
    encrypted_api_key VARCHAR(1000) NULL, -- Lưu chuỗi API Key đã mã hóa AES-256 ở Backend
    
    default_text_model VARCHAR(100) NOT NULL CONSTRAINT DF_ai_text_model DEFAULT 'gemini-2.5-flash',
    default_vision_model VARCHAR(100) NOT NULL CONSTRAINT DF_ai_vision_model DEFAULT 'gemini-2.5-flash',
    
    -- Giọng văn thương hiệu (Brand Voice) và các System Prompt mẫu cho từng tác vụ:
    -- {"brand_voice": "Chuyên nghiệp, sang trọng", "seo_writer_prompt": "...", "html_tagger_prompt": "...", "translator_prompt": "..."}
    prompt_configs NVARCHAR(MAX) NOT NULL CONSTRAINT DF_ai_prompts DEFAULT N'{}'
        CONSTRAINT CK_ai_prompts_json CHECK (ISJSON(prompt_configs, OBJECT) = 1),
        
    -- Kiểm soát chi phí Token hàng tháng cho từng Website khách hàng
    monthly_token_limit BIGINT NULL,
    tokens_used_this_month BIGINT NOT NULL CONSTRAINT DF_ai_tokens_used DEFAULT 0,
    is_enabled BIT NOT NULL CONSTRAINT DF_ai_enabled DEFAULT 1,
    updated_at DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_ai_updated DEFAULT SYSDATETIMEOFFSET(),
    
    CONSTRAINT PK_cms_ai_settings PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_ai_settings_site FOREIGN KEY (site_id) REFERENCES dbo.cms_sites(id) ON DELETE CASCADE,
    CONSTRAINT UQ_ai_settings_site UNIQUE NONCLUSTERED (site_id)
);
GO

/* ============================================================================
   CẬP NHẬT STORED PROCEDURE BỘ LỌC ĐỘNG: GIA CỐ OUTER APPLY CHO @sort_field
============================================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_cms_dynamic_filter_entries
    @site_id UNIQUEIDENTIFIER,
    @content_type_api_id VARCHAR(100),
    @locale VARCHAR(10) = 'vi',
    @keyword NVARCHAR(250) = NULL,
    @filters_json NVARCHAR(MAX) = NULL,
    @sort_field VARCHAR(100) = 'published_at',
    @sort_dir VARCHAR(4) = 'DESC',
    @page_index INT = 1,
    @page_size INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    IF @page_index < 1 SET @page_index = 1;
    IF @page_size < 1 SET @page_size = 20;

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
        SELECT field_key, op, values_json, min_val, max_val, hierarchy_prefix
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

    CREATE TABLE #MatchedEntries (
        entry_id UNIQUEIDENTIFIER PRIMARY KEY
    );

    INSERT INTO #MatchedEntries (entry_id)
    SELECT e.id
    FROM dbo.cms_entries e
    INNER JOIN dbo.cms_content_types ct ON e.content_type_id = ct.id
    INNER JOIN dbo.cms_entry_locales l ON l.entry_id = e.id AND l.locale = @locale
    WHERE e.site_id = @site_id
      AND (@content_type_api_id IS NULL OR ct.api_id = @content_type_api_id)
      AND e.status = 'published'
      AND (@keyword IS NULL OR l.title LIKE N'%' + @keyword + N'%')
      AND (
          @total_filter_groups = 0
          OR (
              SELECT COUNT(DISTINCT pf.filter_id)
              FROM #ParsedFilters pf
              INNER JOIN dbo.cms_entry_index_values idx 
                  ON idx.entry_id = e.id 
                  AND idx.field_key = pf.field_key
                  AND idx.locale IN ('all', @locale)
              WHERE 
                  (pf.op = 'in' AND idx.string_val IN (SELECT LOWER(value) FROM OPENJSON(pf.values_json)))
                  OR (pf.op = 'range' 
                      AND (pf.min_val IS NULL OR idx.number_val >= pf.min_val)
                      AND (pf.max_val IS NULL OR idx.number_val <= pf.max_val))
                  OR (pf.op = 'hierarchy' AND idx.hierarchy_path LIKE pf.hierarchy_prefix + '%')
          ) = @total_filter_groups
      );

    -- RESULT SET 1: Dùng OUTER APPLY SELECT TOP 1 để chống nhân bản dòng tuyệt đối khi sắp xếp động
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
    OUTER APPLY (
        SELECT TOP 1 s.number_val
        FROM dbo.cms_entry_index_values s
        WHERE s.entry_id = e.id 
          AND s.field_key = @sort_field 
          AND s.locale IN ('all', @locale)
          AND s.number_val IS NOT NULL
    ) sort_idx
    ORDER BY
        CASE WHEN @sort_field = 'published_at' AND @sort_dir = 'DESC' THEN e.published_at END DESC,
        CASE WHEN @sort_field = 'published_at' AND @sort_dir = 'ASC'  THEN e.published_at END ASC,
        CASE WHEN @sort_field = 'title'        AND @sort_dir = 'ASC'  THEN l.title END ASC,
        CASE WHEN @sort_field = 'title'        AND @sort_dir = 'DESC' THEN l.title END DESC,
        CASE WHEN @sort_field NOT IN ('published_at', 'title') AND @sort_dir = 'ASC'  THEN sort_idx.number_val END ASC,
        CASE WHEN @sort_field NOT IN ('published_at', 'title') AND @sort_dir = 'DESC' THEN sort_idx.number_val END DESC
    OFFSET (@page_index - 1) * @page_size ROWS
    FETCH NEXT @page_size ROWS ONLY
    OPTION (RECOMPILE);

    -- RESULT SET 2: Thống kê Facet Counts
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
