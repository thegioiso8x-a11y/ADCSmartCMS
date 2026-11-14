using AdcSmartCms.Domain.Entities;
using Mapster;

namespace AdcSmartCms.Application.Sites;

/// <summary>
/// IRegister được TypeAdapterConfig.GlobalSettings.Scan(...) tự phát hiện.
/// Nếu Scan hoạt động, SupportedLocales "vi,en" (string) sẽ thành ["vi","en"] (string[]).
/// </summary>
public class CmsSiteMappingConfig : IRegister
{
    public void Register(TypeAdapterConfig config)
    {
        config.NewConfig<CmsSite, CmsSiteDto>()
            .Map(dest => dest.SupportedLocales,
                 src => src.SupportedLocales.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }
}
