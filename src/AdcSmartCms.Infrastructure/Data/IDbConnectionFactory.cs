using System.Data;

namespace AdcSmartCms.Infrastructure.Data;

public interface IDbConnectionFactory
{
    /// <summary>Tạo connection MỚI, chưa mở (Dapper tự mở/đóng). Caller chịu trách nhiệm Dispose.</summary>
    IDbConnection CreateConnection();
}
