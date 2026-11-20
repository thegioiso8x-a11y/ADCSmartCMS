using System.Data;
using System.Data.Common;
using System.Text.Json;
using AdcSmartCms.Application.Content;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Bước 1.6: Dapper repository cho Dynamic Content.
/// Bám DDL thật trong data_SmartCMS.sql:
///  cms_content_types: api_id VARCHAR(100), display_name NVARCHAR(150), kind VARCHAR(30)
///  cms_field_definitions: field_key VARCHAR(100), display_label NVARCHAR(150), field_type VARCHAR(50), is_required BIT
///  cms_entries: site_id, content_type_id, base_data NVARCHAR(MAX) CHECK ISJSON(OBJECT), status DEFAULT 'draft'
///  cms_entry_locales: site_id, entry_id, locale VARCHAR(10) DEFAULT 'vi', title NVARCHAR(500), slug VARCHAR(500),
///                     localized_data NVARCHAR(MAX) CHECK ISJSON(OBJECT)
/// Sau khi insert gọi SP dbo.usp_cms_sync_entry_indexes(@entry_id) để đồng bộ bảng index.
/// </summary>
public sealed class ContentRepository : IContentRepository
{
    // Content type có thể dùng chung (site_id IS NULL) hoặc riêng của site (site_id = @SiteId).
    // @SiteId NULL => chỉ lấy loại dùng chung; có giá trị => lấy cả dùng chung lẫn riêng của site đó.
    private const string SelectContentTypesSql = """
        SELECT id AS Id, api_id AS ApiId, display_name AS DisplayName, kind AS Kind
        FROM dbo.cms_content_types
        WHERE site_id IS NULL OR site_id = @SiteId
        ORDER BY api_id;
        """;

    private const string SelectFieldsSql = """
        SELECT fd.id AS Id, fd.field_key AS FieldKey, fd.display_label AS DisplayLabel,
               fd.field_type AS FieldType, fd.is_required AS IsRequired,
               fd.is_filterable AS IsFilterable, fd.is_localized AS IsLocalized
        FROM dbo.cms_field_definitions fd
        INNER JOIN dbo.cms_content_types ct ON ct.id = fd.content_type_id
        WHERE (ct.site_id IS NULL OR ct.site_id = @SiteId) AND ct.api_id = @ApiId
        ORDER BY fd.sort_order, fd.field_key;
        """;

    // Ưu tiên content type riêng của site (site_id = @SiteId) trước, rồi mới tới loại dùng chung (site_id IS NULL).
    private const string FindContentTypeIdSql = """
        SELECT TOP 1 id FROM dbo.cms_content_types
        WHERE (site_id IS NULL OR site_id = @SiteId) AND api_id = @ApiId
        ORDER BY CASE WHEN site_id IS NULL THEN 1 ELSE 0 END;
        """;

    private const string InsertEntrySql = """
        INSERT INTO dbo.cms_entries (site_id, content_type_id, base_data)
        OUTPUT INSERTED.id
        VALUES (@SiteId, @ContentTypeId, @BaseData);
        """;

    private const string InsertLocaleSql = """
        INSERT INTO dbo.cms_entry_locales (site_id, entry_id, locale, title, slug, localized_data)
        OUTPUT INSERTED.id
        VALUES (@SiteId, @EntryId, @Locale, @Title, @Slug, @LocalizedData);
        """;

    private const string SyncIndexesSql = "EXEC dbo.usp_cms_sync_entry_indexes @entry_id = @EntryId;";

    private const string UpdateEntrySql = """
        UPDATE dbo.cms_entries
        SET base_data = @BaseData,
            updated_at = SYSDATETIMEOFFSET()
        WHERE id = @EntryId;
        """;

    // Cập nhật bản ghi locale theo (entry_id, locale). Nếu chưa có bản ghi locale thì INSERT mới.
    private const string UpdateLocaleSql = """
        UPDATE dbo.cms_entry_locales
        SET title = @Title,
            slug = @Slug,
            localized_data = @LocalizedData,
            updated_at = SYSDATETIMEOFFSET()
        WHERE entry_id = @EntryId AND locale = @Locale;
        """;

    private const string InsertLocaleIfMissingSql = """
        INSERT INTO dbo.cms_entry_locales (site_id, entry_id, locale, title, slug, localized_data)
        SELECT e.site_id, e.id, @Locale, @Title, @Slug, @LocalizedData
        FROM dbo.cms_entries e
        WHERE e.id = @EntryId
          AND NOT EXISTS (
              SELECT 1 FROM dbo.cms_entry_locales l
              WHERE l.entry_id = e.id AND l.locale = @Locale
          );
        """;

    private const string DeleteEntrySql = "DELETE FROM dbo.cms_entries WHERE id = @EntryId;";

    private const string SelectEntryByIdSql = """
        SELECT e.id AS Id,
               l.title AS Title,
               l.slug AS Slug,
               e.base_data AS BaseData,
               l.localized_data AS LocalizedData,
               e.status AS Status
        FROM dbo.cms_entries e
        INNER JOIN dbo.cms_entry_locales l ON l.entry_id = e.id AND l.locale = @Locale
        WHERE e.id = @EntryId;
        """;

    private const string FilterEntriesSql = "dbo.usp_cms_dynamic_filter_entries";

    private const string UpdateStatusSql = """
        UPDATE dbo.cms_entries
        SET status = @Status,
            published_at = CASE WHEN @Status = 'published' THEN SYSDATETIMEOFFSET() ELSE published_at END,
            updated_at = SYSDATETIMEOFFSET()
        OUTPUT INSERTED.id, INSERTED.status, INSERTED.published_at
        WHERE id = @EntryId;
        """;

    private const string SelectVersionsSql = """
        SELECT version_number AS VersionNumber, change_summary AS ChangeSummary, created_at AS CreatedAt
        FROM dbo.cms_entry_versions
        WHERE entry_id = @EntryId
        ORDER BY version_number DESC;
        """;

    // ---------- CRUD Content Types ----------

    private const string ContentTypeApiExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_content_types
        WHERE api_id = @ApiId AND ((@SiteId IS NULL AND site_id IS NULL) OR site_id = @SiteId);
        """;

    private const string InsertContentTypeSql = """
        INSERT INTO dbo.cms_content_types
            (site_id, api_id, display_name, kind, description, is_localized, enable_versioning, enable_workflow)
        OUTPUT INSERTED.id, INSERTED.api_id, INSERTED.display_name, INSERTED.kind
        VALUES (@SiteId, @ApiId, @DisplayName, @Kind, @Description, @IsLocalized, @EnableVersioning, @EnableWorkflow);
        """;

    private const string UpdateContentTypeSql = """
        UPDATE dbo.cms_content_types
        SET display_name      = COALESCE(@DisplayName, display_name),
            kind              = COALESCE(@Kind, kind),
            description       = COALESCE(@Description, description),
            is_localized      = COALESCE(@IsLocalized, is_localized),
            enable_versioning = COALESCE(@EnableVersioning, enable_versioning),
            enable_workflow   = COALESCE(@EnableWorkflow, enable_workflow),
            updated_at        = SYSDATETIMEOFFSET()
        WHERE id = @Id;
        """;

    private const string DeleteContentTypeSql = "DELETE FROM dbo.cms_content_types WHERE id = @Id;";

    // ---------- CRUD Fields ----------

    private const string ContentTypeExistsByIdSql = "SELECT COUNT(1) FROM dbo.cms_content_types WHERE id = @ContentTypeId;";

    private const string FieldKeyExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_field_definitions
        WHERE content_type_id = @ContentTypeId AND field_key = @FieldKey;
        """;

    private const string InsertFieldSql = """
        INSERT INTO dbo.cms_field_definitions
            (content_type_id, field_key, display_label, field_type, is_required, is_unique, is_localized,
             is_searchable, is_indexed, is_filterable, filter_type, sort_order)
        OUTPUT INSERTED.id, INSERTED.field_key, INSERTED.display_label, INSERTED.field_type,
               INSERTED.is_required, INSERTED.is_filterable, INSERTED.is_localized
        VALUES (@ContentTypeId, @FieldKey, @DisplayLabel, @FieldType, @IsRequired, @IsUnique, @IsLocalized,
                @IsSearchable, @IsIndexed, @IsFilterable, @FilterType, @SortOrder);
        """;

    private const string UpdateFieldSql = """
        UPDATE dbo.cms_field_definitions
        SET display_label = COALESCE(@DisplayLabel, display_label),
            field_type    = COALESCE(@FieldType, field_type),
            is_required   = COALESCE(@IsRequired, is_required),
            is_unique     = COALESCE(@IsUnique, is_unique),
            is_localized  = COALESCE(@IsLocalized, is_localized),
            is_searchable = COALESCE(@IsSearchable, is_searchable),
            is_indexed    = COALESCE(@IsIndexed, is_indexed),
            is_filterable = COALESCE(@IsFilterable, is_filterable),
            filter_type   = COALESCE(@FilterType, filter_type),
            sort_order    = COALESCE(@SortOrder, sort_order)
        WHERE id = @FieldId;
        """;

    private const string DeleteFieldSql = "DELETE FROM dbo.cms_field_definitions WHERE id = @FieldId;";

    private const string SelectSitemapSql = """
        SELECT l.locale AS Locale, l.slug AS Slug, l.updated_at AS UpdatedAt,
               l.sitemap_priority AS Priority, l.sitemap_changefreq AS ChangeFreq
        FROM dbo.cms_entry_locales l
        INNER JOIN dbo.cms_entries e ON e.id = l.entry_id
        WHERE e.site_id = @SiteId
          AND e.status = 'published'
          AND l.is_indexable = 1
          AND l.slug IS NOT NULL
        ORDER BY l.updated_at DESC;
        """;

    // ---------- Page Builder: cms_entry_blocks ----------

    private const string SelectBlocksSql = """
        SELECT id AS Id, entry_id AS EntryId, locale AS Locale, zone_key AS ZoneKey,
               component_type_id AS ComponentTypeId, block_data AS BlockData,
               sort_order AS SortOrder, is_visible AS IsVisible
        FROM dbo.cms_entry_blocks
        WHERE entry_id = @EntryId AND locale = @Locale
        ORDER BY sort_order ASC;
        """;

    private const string SelectBlockByIdSql = """
        SELECT id AS Id, entry_id AS EntryId, locale AS Locale, zone_key AS ZoneKey,
               component_type_id AS ComponentTypeId, block_data AS BlockData,
               sort_order AS SortOrder, is_visible AS IsVisible
        FROM dbo.cms_entry_blocks
        WHERE id = @BlockId;
        """;

    private const string EntryExistsByIdSql = "SELECT COUNT(1) FROM dbo.cms_entries WHERE id = @EntryId;";

    private const string InsertBlockSql = """
        INSERT INTO dbo.cms_entry_blocks
            (entry_id, locale, zone_key, component_type_id, block_data, sort_order, is_visible)
        OUTPUT INSERTED.id
        VALUES (@EntryId, @Locale, @ZoneKey, @ComponentTypeId, @BlockData, @SortOrder, @IsVisible);
        """;

    private const string UpdateBlockSql = """
        UPDATE dbo.cms_entry_blocks
        SET block_data = COALESCE(@BlockData, block_data),
            sort_order = COALESCE(@SortOrder, sort_order),
            is_visible = COALESCE(@IsVisible, is_visible)
        WHERE id = @BlockId;
        """;

    private const string DeleteBlockSql = "DELETE FROM dbo.cms_entry_blocks WHERE id = @BlockId;";

    private readonly IDbConnectionFactory _factory;

    public ContentRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<ContentTypeDto>> GetContentTypesAsync(Guid? siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<ContentTypeDto>(
            new CommandDefinition(SelectContentTypesSql, new { SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<FieldDefinitionDto>?> GetFieldsAsync(string apiId, Guid? siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Phân biệt "content type không tồn tại" (null) với "tồn tại nhưng chưa có trường" (list rỗng).
        var exists = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
            FindContentTypeIdSql, new { ApiId = Ansi(apiId, 100), SiteId = siteId }, cancellationToken: ct));
        if (exists is null) return null;

        var rows = await conn.QueryAsync<FieldDefinitionDto>(new CommandDefinition(
            SelectFieldsSql, new { ApiId = Ansi(apiId, 100), SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<CreateEntryResult?> CreateEntryAsync(CreateEntryRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var contentTypeId = await conn.ExecuteScalarAsync<Guid?>(new CommandDefinition(
            FindContentTypeIdSql, new { ApiId = Ansi(request.ContentTypeApiId, 100), SiteId = (Guid?)request.SiteId }, cancellationToken: ct));
        if (contentTypeId is null) return null;

        // base_data / localized_data phải là JSON OBJECT (CHECK ISJSON(..., OBJECT)). Mặc định "{}".
        var baseData = ToJsonObject(request.BaseData);
        var localizedData = ToJsonObject(request.LocalizedData);

        using var tx = conn.BeginTransaction();
        try
        {
            var entryId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertEntrySql, new
            {
                request.SiteId,
                ContentTypeId = contentTypeId.Value,
                BaseData = baseData
            }, tx, cancellationToken: ct));

            var localeId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertLocaleSql, new
            {
                request.SiteId,
                EntryId = entryId,
                Locale = Ansi(request.Locale, 10),
                Title = request.Title,          // NVARCHAR(500)
                Slug = Ansi(request.Slug, 500), // VARCHAR(500)
                LocalizedData = localizedData
            }, tx, cancellationToken: ct));

            // Đồng bộ index trong CÙNG transaction để dữ liệu lọc luôn nhất quán với entry.
            await conn.ExecuteAsync(new CommandDefinition(SyncIndexesSql, new { EntryId = entryId }, tx, cancellationToken: ct));

            tx.Commit();
            return new CreateEntryResult(entryId, localeId, contentTypeId.Value, "draft");
        }
        catch
        {
            // using tx => rollback khi Dispose.
            throw;
        }
    }

    public async Task<EntryDetailResponse?> GetEntryByIdAsync(Guid entryId, string locale, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var localeCode = Ansi(string.IsNullOrWhiteSpace(locale) ? "vi" : locale, 10);
        return await conn.QuerySingleOrDefaultAsync<EntryDetailResponse>(new CommandDefinition(
            SelectEntryByIdSql, new { EntryId = entryId, Locale = localeCode }, cancellationToken: ct));
    }

    public async Task<bool> UpdateEntryAsync(Guid entryId, string title, string slug, string baseData, string localizedData, string locale, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // base_data / localized_data phải là JSON OBJECT (CHECK ISJSON(..., OBJECT)).
        var baseJson = NormalizeJsonObject(baseData);
        var localizedJson = NormalizeJsonObject(localizedData);
        var localeCode = Ansi(string.IsNullOrWhiteSpace(locale) ? "vi" : locale, 10);

        using var tx = conn.BeginTransaction();
        try
        {
            var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateEntrySql, new
            {
                EntryId = entryId,
                BaseData = baseJson
            }, tx, cancellationToken: ct));

            // Entry không tồn tại -> rollback (không ghi gì).
            if (affected == 0)
            {
                tx.Rollback();
                return false;
            }

            var localeParams = new
            {
                EntryId = entryId,
                Locale = localeCode,
                Title = title,                    // NVARCHAR(500)
                Slug = Ansi(slug, 500),           // VARCHAR(500)
                LocalizedData = localizedJson
            };

            var localeAffected = await conn.ExecuteAsync(new CommandDefinition(UpdateLocaleSql, localeParams, tx, cancellationToken: ct));
            if (localeAffected == 0)
            {
                // Chưa có bản ghi locale cho ngôn ngữ này -> tạo mới.
                await conn.ExecuteAsync(new CommandDefinition(InsertLocaleIfMissingSql, localeParams, tx, cancellationToken: ct));
            }

            // SP tự xóa index cũ của entry rồi insert lại từ base_data + localized_data.
            await conn.ExecuteAsync(new CommandDefinition(SyncIndexesSql, new { EntryId = entryId }, tx, cancellationToken: ct));

            tx.Commit();
            return true;
        }
        catch
        {
            // using tx => rollback khi Dispose.
            throw;
        }
    }

    public async Task<bool> DeleteEntryAsync(Guid entryId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // cms_entry_locales / cms_entry_index_values / cms_entry_relations / cms_entry_blocks /
        // cms_entry_versions / cms_ecommerce_variants đều có ON DELETE CASCADE.
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            DeleteEntrySql, new { EntryId = entryId }, cancellationToken: ct));
        return affected > 0;
    }

    public async Task<FilterEntriesResult> FilterEntriesAsync(FilterEntriesQuery query, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Anonymous object với kiểu nguyên thủy (string?/Guid/int) — Dapper tự map null -> DBNull.Value.
        // TUYỆT ĐỐI KHÔNG dùng DbString/DynamicParameters cho tham số Stored Procedure:
        // Dapper không có type handler cho DbString khi truyền vào SP => "No mapping exists from object type Dapper.DbString".
        var parameters = new
        {
            site_id = query.SiteId,
            // contentTypeApiId null/rỗng => null => Dapper map sang DBNull.Value => SP lấy toàn bộ content type.
            content_type_api_id = string.IsNullOrWhiteSpace(query.ContentTypeApiId) ? null : query.ContentTypeApiId,
            locale = query.Locale,
            keyword = query.Keyword,                 // NVARCHAR(250)
            filters_json = query.FiltersJson,        // NVARCHAR(MAX)
            sort_field = query.SortField,
            sort_dir = query.SortDir,
            page_index = query.PageIndex,
            page_size = query.PageSize
        };

        using var multi = await conn.QueryMultipleAsync(new CommandDefinition(
            FilterEntriesSql, parameters, commandType: CommandType.StoredProcedure, cancellationToken: ct));

        // Result Set 1: danh sách bản ghi phân trang.
        var items = (await multi.ReadAsync<FilteredEntryItem>()).ToList();

        // Result Set 2: facet counts. SP luôn trả result set này (có thể rỗng).
        var facets = multi.IsConsumed ? new List<FacetCount>() : (await multi.ReadAsync<FacetCount>()).ToList();

        return new FilterEntriesResult(items, facets);
    }

    public async Task<UpdateStatusResult?> UpdateStatusAsync(Guid entryId, string status, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var row = await conn.QuerySingleOrDefaultAsync<(Guid Id, string Status, DateTimeOffset? PublishedAt)>(
            new CommandDefinition(UpdateStatusSql, new { EntryId = entryId, Status = Ansi(status, 30) }, cancellationToken: ct));
        if (row.Id == Guid.Empty) return null;
        return new UpdateStatusResult(row.Id, row.Status, row.PublishedAt);
    }

    public async Task<IReadOnlyList<EntryVersionDto>> GetVersionsAsync(Guid entryId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<EntryVersionDto>(
            new CommandDefinition(SelectVersionsSql, new { EntryId = entryId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<SitemapUrl>> GetSitemapAsync(Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<(string Locale, string Slug, DateTimeOffset UpdatedAt, decimal Priority, string ChangeFreq)>(
            new CommandDefinition(SelectSitemapSql, new { SiteId = siteId }, cancellationToken: ct));

        return rows.Select(r => new SitemapUrl(
            Loc: $"https://tech.adccms.vn/{r.Locale}/{r.Slug}",
            LastMod: r.UpdatedAt,
            Priority: r.Priority,
            ChangeFreq: r.ChangeFreq)).ToList();
    }

    // ---------- CRUD Content Types ----------

    public async Task<ContentTypeDto?> CreateContentTypeAsync(CreateContentTypeRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            ContentTypeApiExistsSql, new { ApiId = Ansi(request.ApiId, 100), SiteId = request.SiteId }, cancellationToken: ct));
        if (exists > 0) return null;

        return await conn.QuerySingleAsync<ContentTypeDto>(new CommandDefinition(InsertContentTypeSql, new
        {
            request.SiteId,
            ApiId = Ansi(request.ApiId, 100),
            DisplayName = request.DisplayName,   // NVARCHAR(150)
            Kind = Ansi(request.Kind, 30),
            Description = request.Description,   // NVARCHAR(500)
            request.IsLocalized,
            request.EnableVersioning,
            request.EnableWorkflow
        }, cancellationToken: ct));
    }

    public async Task<bool> UpdateContentTypeAsync(Guid id, UpdateContentTypeRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateContentTypeSql, new
        {
            Id = id,
            DisplayName = request.DisplayName,
            Kind = request.Kind is null ? null : Ansi(request.Kind, 30),
            Description = request.Description,
            request.IsLocalized,
            request.EnableVersioning,
            request.EnableWorkflow
        }, cancellationToken: ct));

        return affected > 0;
    }

    public async Task<bool> DeleteContentTypeAsync(Guid id, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // cms_field_definitions có FK ON DELETE CASCADE tới cms_content_types.
        var affected = await conn.ExecuteAsync(new CommandDefinition(DeleteContentTypeSql, new { Id = id }, cancellationToken: ct));
        return affected > 0;
    }

    // ---------- CRUD Fields ----------

    public async Task<FieldDefinitionDto?> CreateFieldAsync(Guid contentTypeId, CreateFieldRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var ctExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            ContentTypeExistsByIdSql, new { ContentTypeId = contentTypeId }, cancellationToken: ct));
        if (ctExists == 0) return null;

        var keyExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            FieldKeyExistsSql, new { ContentTypeId = contentTypeId, FieldKey = Ansi(request.FieldKey, 100) }, cancellationToken: ct));
        if (keyExists > 0) return null;

        // Anonymous object: Dapper tự map null -> DBNull.Value cho cột nullable (FilterType).
        // KHÔNG dùng DbString cho cột nullable (DbString null gây InvalidOperationException).
        return await conn.QuerySingleAsync<FieldDefinitionDto>(new CommandDefinition(InsertFieldSql, new
        {
            ContentTypeId = contentTypeId,
            request.FieldKey,
            request.DisplayLabel,
            request.FieldType,
            request.IsRequired,
            request.IsUnique,
            request.IsLocalized,
            request.IsSearchable,
            request.IsIndexed,
            request.IsFilterable,
            request.FilterType,
            request.SortOrder
        }, cancellationToken: ct));
    }

    public async Task<bool> UpdateFieldAsync(Guid fieldId, UpdateFieldRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Anonymous object: null -> DBNull.Value (COALESCE giữ nguyên giá trị cũ). Không dùng DbString cho cột nullable.
        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateFieldSql, new
        {
            FieldId = fieldId,
            request.DisplayLabel,
            request.FieldType,
            request.IsRequired,
            request.IsUnique,
            request.IsLocalized,
            request.IsSearchable,
            request.IsIndexed,
            request.IsFilterable,
            request.FilterType,
            request.SortOrder
        }, cancellationToken: ct));

        return affected > 0;
    }

    public async Task<bool> DeleteFieldAsync(Guid fieldId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(DeleteFieldSql, new { FieldId = fieldId }, cancellationToken: ct));
        return affected > 0;
    }

    // ---------- Page Builder: cms_entry_blocks ----------

    public async Task<IReadOnlyList<EntryBlockDto>> GetBlocksAsync(Guid entryId, string locale, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var localeCode = Ansi(string.IsNullOrWhiteSpace(locale) ? "vi" : locale, 10);
        var rows = await conn.QueryAsync<EntryBlockDto>(new CommandDefinition(
            SelectBlocksSql, new { EntryId = entryId, Locale = localeCode }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<EntryBlockDto?> CreateBlockAsync(Guid entryId, CreateBlockRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Entry phải tồn tại (FK_blocks_entry).
        var entryExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            EntryExistsByIdSql, new { EntryId = entryId }, cancellationToken: ct));
        if (entryExists == 0) return null;

        // component_type_id phải tồn tại (FK_blocks_component_type).
        var ctExists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            ContentTypeExistsByIdSql, new { ContentTypeId = request.ComponentTypeId }, cancellationToken: ct));
        if (ctExists == 0) return null;

        // block_data phải là JSON OBJECT (CHECK ISJSON(..., OBJECT)).
        var blockData = ToJsonObject(request.BlockData);

        // Anonymous object: Dapper tự map null -> DBNull.Value (không dùng DbString cho cột nullable).
        var blockId = await conn.ExecuteScalarAsync<Guid>(new CommandDefinition(InsertBlockSql, new
        {
            EntryId = entryId,
            Locale = Ansi(string.IsNullOrWhiteSpace(request.Locale) ? "vi" : request.Locale, 10),
            ZoneKey = Ansi(string.IsNullOrWhiteSpace(request.ZoneKey) ? "main_layout" : request.ZoneKey, 100),
            request.ComponentTypeId,
            BlockData = blockData,
            request.SortOrder,
            request.IsVisible
        }, cancellationToken: ct));

        return await conn.QuerySingleOrDefaultAsync<EntryBlockDto>(new CommandDefinition(
            SelectBlockByIdSql, new { BlockId = blockId }, cancellationToken: ct));
    }

    public async Task<EntryBlockDto?> UpdateBlockAsync(Guid blockId, UpdateBlockRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // blockData: null => giữ nguyên; có giá trị => phải là JSON object.
        string? blockData = null;
        if (request.BlockData is { } bd && bd.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
        {
            if (bd.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("blockData phải là JSON object.");
            blockData = bd.GetRawText();
        }

        // Anonymous object: null -> DBNull.Value (COALESCE giữ nguyên giá trị cũ).
        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateBlockSql, new
        {
            BlockId = blockId,
            BlockData = blockData,
            request.SortOrder,
            request.IsVisible
        }, cancellationToken: ct));

        if (affected == 0) return null;

        return await conn.QuerySingleOrDefaultAsync<EntryBlockDto>(new CommandDefinition(
            SelectBlockByIdSql, new { BlockId = blockId }, cancellationToken: ct));
    }

    public async Task<bool> DeleteBlockAsync(Guid blockId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(
            DeleteBlockSql, new { BlockId = blockId }, cancellationToken: ct));
        return affected > 0;
    }

    /// <summary>Serialize JsonElement thành chuỗi JSON object; null/không phải object -> "{}".</summary>
    private static string ToJsonObject(JsonElement? element)
    {
        if (element is not { } e || e.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return "{}";
        if (e.ValueKind != JsonValueKind.Object)
            throw new ArgumentException("baseData/localizedData phải là JSON object.");
        return e.GetRawText();
    }

    /// <summary>Chuẩn hóa chuỗi JSON đầu vào: rỗng/không phải object -> "{}" (tránh vi phạm CHECK ISJSON).</summary>
    private static string NormalizeJsonObject(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "{}";
        try
        {
            using var doc = JsonDocument.Parse(raw);
            return doc.RootElement.ValueKind == JsonValueKind.Object ? raw : "{}";
        }
        catch (JsonException)
        {
            return "{}";
        }
    }

    private static DbString Ansi(string? value, int length) =>
        new() { Value = value ?? string.Empty, IsAnsi = true, Length = length };
}
