using System.Data.Common;
using AdcSmartCms.Application.Seo;
using Dapper;

namespace AdcSmartCms.Infrastructure.Data;

/// <summary>
/// Technical SEO: Dapper repository cho bảng cms_seo_redirects.
///  cms_seo_redirects: site_id, old_path NVARCHAR(500), new_path NVARCHAR(500), status_code SMALLINT DEFAULT 301,
///                     is_regex BIT, hits_count BIGINT, last_hit_at, note NVARCHAR(255), created_at
///                     UNIQUE (site_id, old_path)
/// </summary>
public sealed class SeoRedirectRepository : ISeoRedirectRepository
{
    private const string SelectColumns = """
        id AS Id, site_id AS SiteId, old_path AS OldPath, new_path AS NewPath,
        status_code AS StatusCode, is_regex AS IsRegex, hits_count AS HitsCount,
        last_hit_at AS LastHitAt, note AS Note, created_at AS CreatedAt
        """;

    private const string SelectBySiteSql = $"""
        SELECT {SelectColumns}
        FROM dbo.cms_seo_redirects
        WHERE site_id = @SiteId
        ORDER BY created_at DESC;
        """;

    private const string SelectByIdSql = $"""
        SELECT {SelectColumns}
        FROM dbo.cms_seo_redirects
        WHERE id = @Id;
        """;

    private const string OldPathExistsSql = """
        SELECT COUNT(1) FROM dbo.cms_seo_redirects
        WHERE site_id = @SiteId AND old_path = @OldPath AND (@ExcludeId IS NULL OR id <> @ExcludeId);
        """;

    private const string InsertSql = $"""
        INSERT INTO dbo.cms_seo_redirects (site_id, old_path, new_path, status_code, is_regex, note)
        OUTPUT INSERTED.id, INSERTED.site_id, INSERTED.old_path, INSERTED.new_path,
               INSERTED.status_code, INSERTED.is_regex, INSERTED.hits_count,
               INSERTED.last_hit_at, INSERTED.note, INSERTED.created_at
        VALUES (@SiteId, @OldPath, @NewPath, @StatusCode, @IsRegex, @Note);
        """;

    private const string UpdateSql = """
        UPDATE dbo.cms_seo_redirects
        SET old_path    = COALESCE(@OldPath, old_path),
            new_path    = COALESCE(@NewPath, new_path),
            status_code = COALESCE(@StatusCode, status_code),
            is_regex    = COALESCE(@IsRegex, is_regex),
            note        = COALESCE(@Note, note)
        WHERE id = @Id;
        """;

    private const string DeleteSql = "DELETE FROM dbo.cms_seo_redirects WHERE id = @Id;";

    private readonly IDbConnectionFactory _factory;

    public SeoRedirectRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<SeoRedirectDto>> GetRedirectsAsync(Guid siteId, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var rows = await conn.QueryAsync<SeoRedirectDto>(new CommandDefinition(
            SelectBySiteSql, new { SiteId = siteId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<SeoRedirectDto?> GetRedirectByIdAsync(Guid id, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        return await conn.QuerySingleOrDefaultAsync<SeoRedirectDto>(new CommandDefinition(
            SelectByIdSql, new { Id = id }, cancellationToken: ct));
    }

    public async Task<SeoRedirectDto?> CreateRedirectAsync(CreateSeoRedirectRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var exists = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            OldPathExistsSql, new { request.SiteId, OldPath = request.OldPath, ExcludeId = (Guid?)null }, cancellationToken: ct));
        if (exists > 0) return null;

        return await conn.QuerySingleAsync<SeoRedirectDto>(new CommandDefinition(InsertSql, new
        {
            request.SiteId,
            request.OldPath,
            request.NewPath,
            request.StatusCode,
            request.IsRegex,
            request.Note
        }, cancellationToken: ct));
    }

    public async Task<bool> UpdateRedirectAsync(Guid id, UpdateSeoRedirectRequest request, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        // Nếu đổi old_path, kiểm tra trùng (site_id, old_path) với bản ghi khác.
        if (!string.IsNullOrWhiteSpace(request.OldPath))
        {
            var current = await conn.QuerySingleOrDefaultAsync<(Guid Id, Guid SiteId)>(new CommandDefinition(
                "SELECT id AS Id, site_id AS SiteId FROM dbo.cms_seo_redirects WHERE id = @Id;", new { Id = id }, cancellationToken: ct));
            if (current.Id == Guid.Empty) return false;

            var dup = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                OldPathExistsSql, new { SiteId = current.SiteId, OldPath = request.OldPath, ExcludeId = (Guid?)id }, cancellationToken: ct));
            if (dup > 0) throw new ArgumentException($"old_path '{request.OldPath}' đã tồn tại trong site.");
        }

        var affected = await conn.ExecuteAsync(new CommandDefinition(UpdateSql, new
        {
            Id = id,
            request.OldPath,
            request.NewPath,
            request.StatusCode,
            request.IsRegex,
            request.Note
        }, cancellationToken: ct));

        return affected > 0;
    }

    public async Task<bool> DeleteRedirectAsync(Guid id, CancellationToken ct)
    {
        using var conn = _factory.CreateConnection();
        if (conn is DbConnection db) await db.OpenAsync(ct); else conn.Open();

        var affected = await conn.ExecuteAsync(new CommandDefinition(DeleteSql, new { Id = id }, cancellationToken: ct));
        return affected > 0;
    }
}
