namespace AdcSmartCms.Application.Menus;

/// <summary>
/// Ném khi thao tác menu tạo ra vòng lặp cha-con (di chuyển mục vào con cháu của chính nó,
/// hoặc tự làm cha của chính mình). Endpoint bắt exception này và trả HTTP 400.
/// </summary>
public sealed class CircularReferenceException : Exception
{
    public CircularReferenceException(string message) : base(message) { }
}
