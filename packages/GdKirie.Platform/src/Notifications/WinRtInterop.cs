using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Windows.Win32.Foundation;

namespace GdKirie.Platform;

/// <summary>
/// A counted WinRT string handle. The raw entry points below exchange it as a
/// pointer, so the generated CsWin32 projections do not apply.
/// </summary>
internal readonly unsafe struct HSTRING
{
    public readonly void* Value;
}

/// <summary>
/// Raw, blittable WinRT and COM entry points shared by the Windows notification
/// types. The generated CsWin32 marshalling overloads for these take handles and
/// managed objects, which do not fit a pointer-and-vtable design.
/// </summary>
[SupportedOSPlatform("windows10.0.14393.0")]
internal static unsafe class WinRtInterop
{
    public static HRESULT RoInitialize(RoInitType apartment) =>
        RoInitializeNative(apartment);

    public static HRESULT RoActivateInstance(HSTRING className, out void* instance) =>
        RoActivateInstanceNative(className, out instance);

    public static HRESULT RoGetActivationFactory(HSTRING className, Guid* iid, void** factory) =>
        RoGetActivationFactoryNative(className, iid, factory);

    public static HRESULT WindowsCreateString(char* value, uint length, HSTRING* created) =>
        WindowsCreateStringNative(value, length, created);

    public static HRESULT WindowsDeleteString(HSTRING value) =>
        WindowsDeleteStringNative(value);

    public static HRESULT CoRegisterClassObject(
        Guid classId,
        void* classObject,
        uint context,
        uint flags,
        out uint cookie) =>
        CoRegisterClassObjectNative(&classId, classObject, context, flags, out cookie);

    public static HRESULT CoRevokeClassObject(uint cookie) =>
        CoRevokeClassObjectNative(cookie);

    [DllImport("api-ms-win-core-winrt-l1-1-0.dll", EntryPoint = "RoInitialize")]
    private static extern HRESULT RoInitializeNative(RoInitType apartment);

    [DllImport("api-ms-win-core-winrt-l1-1-0.dll", EntryPoint = "RoActivateInstance")]
    private static extern HRESULT RoActivateInstanceNative(HSTRING className, out void* instance);

    [DllImport("api-ms-win-core-winrt-l1-1-0.dll", EntryPoint = "RoGetActivationFactory")]
    private static extern HRESULT RoGetActivationFactoryNative(HSTRING className, Guid* iid, void** factory);

    [DllImport("api-ms-win-core-winrt-string-l1-1-0.dll", EntryPoint = "WindowsCreateString")]
    private static extern HRESULT WindowsCreateStringNative(char* value, uint length, HSTRING* created);

    [DllImport("api-ms-win-core-winrt-string-l1-1-0.dll", EntryPoint = "WindowsDeleteString")]
    private static extern HRESULT WindowsDeleteStringNative(HSTRING value);

    [DllImport("ole32.dll", EntryPoint = "CoRegisterClassObject")]
    private static extern HRESULT CoRegisterClassObjectNative(
        Guid* classId,
        void* classObject,
        uint context,
        uint flags,
        out uint cookie);

    [DllImport("ole32.dll", EntryPoint = "CoRevokeClassObject")]
    private static extern HRESULT CoRevokeClassObjectNative(uint cookie);
}

/// <summary>
/// <c>RO_INIT_TYPE</c> for <see cref="WinRtInterop.RoInitialize"/>.
/// </summary>
internal enum RoInitType
{
    SingleThreaded = 0,
    MultiThreaded = 1,
}
