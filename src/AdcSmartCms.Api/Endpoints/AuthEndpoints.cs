using AdcSmartCms.Application.Auth;

namespace AdcSmartCms.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/auth/login: nhận email/password, trả JWT nếu đúng (401 nếu sai).
        app.MapPost("/api/auth/login", async (LoginRequest request, IAuthService auth, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                return Results.BadRequest(new { error = "email là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.Password))
                return Results.BadRequest(new { error = "password là bắt buộc." });

            try
            {
                var result = await auth.LoginAsync(request, ct);
                return result is null
                    ? Results.Json(new { error = "Email hoặc mật khẩu không đúng (hoặc tài khoản bị vô hiệu hóa)." },
                        statusCode: StatusCodes.Status401Unauthorized)
                    : Results.Ok(result);
            }
            catch (Exception ex)
            {
                // Trả lỗi rõ ràng thay vì 500 mờ (thường do DB không kết nối được).
                return Results.Json(new { error = "Đăng nhập thất bại (lỗi hệ thống).", detail = ex.Message },
                    statusCode: StatusCodes.Status500InternalServerError);
            }
        }).AllowAnonymous();

        // POST /api/auth/register: (dùng để test) hash password và lưu vào cms_users.
        app.MapPost("/api/auth/register", async (RegisterRequest request, IAuthService auth, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                return Results.BadRequest(new { error = "email là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.Password))
                return Results.BadRequest(new { error = "password là bắt buộc." });
            if (request.Password.Length < 6)
                return Results.BadRequest(new { error = "password phải có ít nhất 6 ký tự." });
            if (string.IsNullOrWhiteSpace(request.FullName))
                return Results.BadRequest(new { error = "fullName là bắt buộc." });

            try
            {
                var result = await auth.RegisterAsync(request, ct);
                return result is null
                    ? Results.Conflict(new { error = $"Email '{request.Email}' đã tồn tại." })
                    : Results.Json(result, statusCode: StatusCodes.Status201Created);
            }
            catch (Exception ex)
            {
                // Trả lỗi rõ ràng thay vì 500 mờ (thường do DB không kết nối được).
                return Results.Json(new { error = "Đăng ký thất bại (lỗi hệ thống).", detail = ex.Message },
                    statusCode: StatusCodes.Status500InternalServerError);
            }
        }).AllowAnonymous();

        // GET /api/auth/me: trả thông tin user từ JWT (yêu cầu đã đăng nhập).
        app.MapGet("/api/auth/me", (HttpContext http) =>
        {
            var user = http.User;
            return Results.Ok(new
            {
                id = user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
                email = user.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value,
                fullName = user.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value,
                role = user.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value,
                isSuperAdmin = user.FindFirst("is_super_admin")?.Value
            });
        }).RequireAuthorization();

        // GET /api/users: danh sách user (không chứa password_hash), mới nhất trước.
        app.MapGet("/api/users", async (IAuthService auth, CancellationToken ct) =>
            Results.Ok(await auth.GetUsersAsync(ct))).RequireAuthorization();

        // POST /api/users: tạo user mới từ trang quản trị.
        app.MapPost("/api/users", async (CreateUserRequest request, IAuthService auth, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                return Results.BadRequest(new { error = "email là bắt buộc." });
            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return Results.BadRequest(new { error = "password phải có ít nhất 6 ký tự." });
            if (string.IsNullOrWhiteSpace(request.FullName))
                return Results.BadRequest(new { error = "fullName là bắt buộc." });

            var created = await auth.CreateUserAsync(request, ct);
            return created is null
                ? Results.Conflict(new { error = $"Email '{request.Email}' đã tồn tại." })
                : Results.Json(created, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization();

        // PUT /api/users/{id}: cập nhật user (null = giữ nguyên).
        app.MapPut("/api/users/{id:guid}", async (Guid id, UpdateUserRequest request, IAuthService auth, CancellationToken ct) =>
        {
            if (request.Password is not null && request.Password.Length < 6)
                return Results.BadRequest(new { error = "password phải có ít nhất 6 ký tự." });

            var updated = await auth.UpdateUserAsync(id, request, ct);
            return updated is null
                ? Results.NotFound(new { error = $"Không tìm thấy user '{id}'." })
                : Results.Ok(updated);
        }).RequireAuthorization();

        // DELETE /api/users/{id}: xóa user (cascade xóa user_roles).
        app.MapDelete("/api/users/{id:guid}", async (Guid id, IAuthService auth, CancellationToken ct) =>
        {
            var deleted = await auth.DeleteUserAsync(id, ct);
            return deleted
                ? Results.Ok(new { userId = id, status = "deleted" })
                : Results.NotFound(new { error = $"Không tìm thấy user '{id}'." });
        }).RequireAuthorization();

        return app;
    }
}

