using System.Text;
using AdcSmartCms.Api.Endpoints;
using AdcSmartCms.Application.Ai;
using AdcSmartCms.Application.Auth;
using AdcSmartCms.Application.Content;
using AdcSmartCms.Application.Customers;
using AdcSmartCms.Application.Ecommerce;
using AdcSmartCms.Application.Forms;
using AdcSmartCms.Application.Media;
using AdcSmartCms.Application.Menus;
using AdcSmartCms.Application.Rbac;
using AdcSmartCms.Application.Seo;
using AdcSmartCms.Application.Sites;
using AdcSmartCms.Application.Themes;
using AdcSmartCms.Domain.Entities;
using AdcSmartCms.Infrastructure.Ai;
using AdcSmartCms.Infrastructure.Auth;
using AdcSmartCms.Infrastructure.Data;
using AdcSmartCms.Infrastructure.Themes;
using Dapper;
using Mapster;
using MapsterMapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Dapper: map cột snake_case (total_records, entry_id, ...) sang thuộc tính PascalCase (TotalRecords, EntryId, ...).
Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true;

// Mapster (KHÔNG dùng thư viện mapping nào khác)
builder.Services.AddMapster();
// IRegister nằm ở Application, nên quét cả assembly của Api (typeof(Program)) lẫn Application.
TypeAdapterConfig.GlobalSettings.Scan(typeof(Program).Assembly, typeof(CmsSiteDto).Assembly);

// ---------- Milestone 8: JWT Authentication ----------
var jwtSettings = builder.Configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>() ?? new JwtSettings();
if (string.IsNullOrWhiteSpace(jwtSettings.Secret) || jwtSettings.Secret.Length < 32)
{
    // Fallback an toàn cho môi trường dev khi chưa cấu hình appsettings (>= 32 ký tự cho HMAC-SHA256).
    jwtSettings.Secret = "ADC_SmartCMS_DEV_ONLY_SECRET_KEY_CHANGE_ME_0123456789";
}
// Đăng ký instance đã chuẩn hóa (đảm bảo Secret fallback được dùng chung cho cả ký và xác thực token).
builder.Services.AddSingleton(jwtSettings);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Secret)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();

// Dapper: factory chỉ tạo connection khi được gọi, app vẫn chạy được khi chưa có DB.
// Lưu ý: KHÔNG throw trong factory (nếu throw, mọi request sẽ 500 thay vì trả lỗi rõ ràng).
builder.Services.AddSingleton<IDbConnectionFactory>(_ =>
    new SqlConnectionFactory(builder.Configuration.GetConnectionString("DefaultConnection") ?? string.Empty));
builder.Services.AddSingleton<IThemeParser, HtmlThemeParser>();
builder.Services.AddSingleton(new ThemeLintOptions());
builder.Services.AddSingleton<IThemeLinter, ZipThemeLinter>();
builder.Services.AddSingleton<IThemeRepository, ThemeRepository>();
builder.Services.AddSingleton<IThemeImporter, ThemeImporter>();
builder.Services.AddSingleton<IAutoSchemaGenerator, AutoSchemaGenerator>();
builder.Services.AddSingleton<IContentRepository, ContentRepository>();
builder.Services.AddSingleton<IMenuRepository, MenuRepository>();
builder.Services.AddSingleton<IFormRepository, FormRepository>();
builder.Services.AddSingleton<IRbacService, RbacService>();
builder.Services.AddSingleton<ISeoRedirectRepository, SeoRedirectRepository>();
builder.Services.AddSingleton<IMediaRepository, MediaRepository>();
builder.Services.AddSingleton<IEcommerceRepository, EcommerceRepository>();
builder.Services.AddSingleton<ICustomerRepository, CustomerRepository>();
builder.Services.AddSingleton<IAiService, MockAiService>();
builder.Services.AddSingleton<IAiSettingsRepository, AiSettingsRepository>();
builder.Services.AddSingleton<IAuthService, AuthService>();

    builder.Services.AddCors(o => o.AddPolicy("AllowAll", b => b.WithOrigins("http://localhost:3000").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
    app.UseCors("AllowAll");

// Phục vụ file tĩnh trong thư mục /uploads/ (ảnh, tài liệu media) qua URL /uploads/{file}.
// Lưu ý: file được lưu ở ContentRootPath/uploads (ngoài wwwroot), nên phải cấu hình PhysicalFileProvider
// trỏ tới thư mục đó với RequestPath = "/uploads".
var uploadsPath = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});
// Vẫn phục vụ wwwroot mặc định (nếu có).
app.UseStaticFiles();


// ---------- Milestone 8: middleware xác thực/phân quyền ----------
// Bắt buộc: UseAuthentication phải chạy TRƯỚC UseAuthorization, và cả hai trước mọi app.Map... .
app.UseAuthentication();
app.UseAuthorization();

// Trả JSON thay vì trang HTML mặc định khi lỗi (giúp debug 500/401 rõ ràng hơn).
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/json; charset=utf-8";
    await context.Response.WriteAsJsonAsync(new
    {
        error = "Unhandled exception",
        type = feature?.Error.GetType().FullName,
        message = feature?.Error.Message,
        inner = feature?.Error.InnerException?.Message
    });
}));

// DEBUG: dữ liệu giả lập, giá trị lấy từ dòng tech_store đã verify ở Bước 4.0 (KHÔNG đọc DB).
app.MapGet("/api/debug/mapster-check", (IMapper mapper) =>
{
    var site = new CmsSite
    {
        Id = Guid.Parse("2FD0078F-0043-4083-B34F-4BDF7BF6A604"),
        SiteCode = "tech_store",
        SiteName = "Siêu thị Công nghệ ADC",
        PrimaryDomain = "tech.adccms.vn",
        AdditionalDomains = null,
        ActiveThemeId = null,
        DefaultLocale = "vi",
        SupportedLocales = "vi,en",
        SiteSettings = "{}",
        IsActive = true,
        CreatedAt = DateTimeOffset.Parse("2026-10-25T22:39:31.0461257+07:00")
    };

    return Results.Ok(mapper.Map<CmsSiteDto>(site));
}).AllowAnonymous();

// DEBUG: nhận chuỗi HTML, trả về kết quả bóc tách (chưa lưu DB).
app.MapPost("/api/debug/parse-html", (ParseHtmlRequest request, IThemeParser parser) =>
    Results.Ok(parser.ParseHtml(request.Html))).AllowAnonymous();

// DEBUG: upload gói theme .zip (multipart, field 'file'), trả về báo cáo linter. Chưa lưu DB.
// Luôn 200 khi lint chạy được (kể cả gói không hợp lệ: xem IsValid); 400 khi không có tệp.
app.MapPost("/api/debug/lint-theme", (IFormFile? file, IThemeLinter linter) =>
{
    if (file is null || file.Length == 0)
        return Results.BadRequest(new { error = "Thiếu tệp .zip (multipart field 'file')." });

    using var stream = file.OpenReadStream();
    return Results.Ok(linter.Lint(stream));
}).DisableAntiforgery().AllowAnonymous();

// Auth (login/register AllowAnonymous; /me yêu cầu token).
app.MapAuthEndpoints();

// Các nhóm API chính (bảo vệ JWT được gắn trực tiếp trong từng file Endpoints).
app.MapThemeEndpoints();
app.MapContentEndpoints();
app.MapSeoEndpoints();
app.MapSeoRedirectEndpoints();
app.MapMenuEndpoints();
app.MapFormEndpoints();
app.MapRbacEndpoints();
app.MapEcommerceEndpoints();
app.MapCustomerEndpoints();
app.MapMediaEndpoints();
app.MapAiEndpoints();

app.Run();

public sealed record ParseHtmlRequest(string Html);

