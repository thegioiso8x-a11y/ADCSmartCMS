using System.Data;
using Microsoft.Data.SqlClient;

namespace AdcSmartCms.Infrastructure.Data;

public sealed class SqlConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public SqlConnectionFactory(string connectionString)
    {
        // Không throw ở constructor: nếu throw, DI sẽ crash toàn bộ pipeline (mọi request -> 500).
        _connectionString = connectionString ?? string.Empty;
    }

    public IDbConnection CreateConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
            throw new InvalidOperationException(
                "Connection string 'DefaultConnection' chưa được cấu hình trong appsettings.json.");
        return new SqlConnection(_connectionString);
    }
}
