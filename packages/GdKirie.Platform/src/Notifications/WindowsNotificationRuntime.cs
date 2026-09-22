using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;
using Windows.Win32;
using Windows.Win32.System.Com;
using Windows.Win32.System.WinRT;

namespace GdKirie.Platform;

/// <summary>
/// One process-wide toast registration. The COM activator stays in this process
/// and the registry entries are removed once the last Platform host is gone, so
/// a click does not start the executable after that.
/// </summary>
[SupportedOSPlatform("windows10.0.14393.0")]
internal static unsafe class WindowsNotificationRuntime
{
    private const int ClassNotAggregatable = unchecked((int)0x80040110);
    private const int NoInterface = unchecked((int)0x80004002);

    private static readonly Guid ClassFactoryIid = new("00000001-0000-0000-C000-000000000046");
    private static readonly Guid UnknownIid = new("00000000-0000-0000-C000-000000000046");
    private static readonly Guid ActivationIid = new("53E31837-6600-4A81-9395-75CFFE746F94");
    private static readonly object Gate = new();

    private static Action<string>? _listener;
    private static SynchronizationContext? _listenerContext;
    private static nint* _factoryVtable;
    private static nint* _activatorVtable;
    private static void* _factory;
    private static void* _activator;
    private static Thread? _thread;
    private static ManualResetEventSlim? _ready;
    private static ManualResetEventSlim? _stop;
    private static Exception? _startError;
    private static uint _cookie;
    private static string? _applicationId;
    private static Guid _activatorId;
    private static Exception? _registrationError;
    private static bool _registering;
    private static bool _registered;

    public static void SetListener(Action<string> onActivated, SynchronizationContext synchronizationContext)
    {
        lock (Gate)
        {
            _listener = onActivated;
            _listenerContext = synchronizationContext;
        }
    }

    public static void RemoveListener()
    {
        Thread? thread = null;
        lock (Gate)
        {
            _listener = null;
            _listenerContext = null;
            if (!_registered)
            {
                return;
            }

            _registered = false;
            _stop?.Set();
            thread = _thread;
            _thread = null;
        }

        thread?.Join();
        DeleteRegistry();
    }

    public static void Show(NotificationPayload notification)
    {
        EnsureRegistered();
        WindowsToastApi.Show(
            ApplicationId(),
            ToastXml(notification));
    }

    private static void EnsureRegistered()
    {
        var startRegistration = false;
        lock (Gate)
        {
            if (_registered)
            {
                return;
            }

            while (_registering)
            {
                Monitor.Wait(Gate);
            }

            if (_registered)
            {
                return;
            }

            if (_registrationError is not null)
            {
                var error = _registrationError;
                _registrationError = null;
                ExceptionDispatchInfo.Capture(error).Throw();
            }

            _registering = true;
            startRegistration = true;
        }

        if (!startRegistration)
        {
            return;
        }

        try
        {
            var identity = CreateIdentity();
            WriteRegistry(identity);
            try
            {
                StartActivator(identity.ActivatorId);
            }
            catch
            {
                DeleteRegistry();
                throw;
            }

            lock (Gate)
            {
                _applicationId = identity.ApplicationId;
                _activatorId = identity.ActivatorId;
                _registered = _listener is not null;
                _registering = false;
                Monitor.PulseAll(Gate);
            }

            if (!_registered)
            {
                RemoveListener();
            }
        }
        catch (Exception error)
        {
            lock (Gate)
            {
                _registering = false;
                _registrationError = error;
                Monitor.PulseAll(Gate);
            }

            throw;
        }
    }

    private static string ApplicationId()
    {
        lock (Gate)
        {
            return _applicationId
                ?? throw new InvalidOperationException("Windows notification identity is not registered.");
        }
    }

    private static NotificationIdentity CreateIdentity()
    {
        var executablePath = Environment.ProcessPath
            ?? throw new InvalidOperationException("Windows notifications require the current executable path.");
        if (executablePath.Contains('"', StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Windows notifications cannot register an executable path that contains quotes.");
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(executablePath));
        var applicationId = "GdKirie." + Convert.ToHexString(hash)[..32];
        var activatorId = new Guid(hash.AsSpan(0, 16));
        var displayName = Path.GetFileNameWithoutExtension(executablePath);
        if (string.IsNullOrWhiteSpace(displayName))
        {
            displayName = "Kirie";
        }

        return new NotificationIdentity(applicationId, activatorId, displayName, executablePath);
    }

    private static void WriteRegistry(NotificationIdentity identity)
    {
        using var applicationKey = Registry.CurrentUser.CreateSubKey(
            $@"Software\Classes\AppUserModelId\{identity.ApplicationId}");
        applicationKey.SetValue("DisplayName", identity.DisplayName);
        applicationKey.SetValue("IconBackgroundColor", "FFDDDDDD");
        applicationKey.SetValue("CustomActivator", identity.ActivatorId.ToString("B"));

        using var serverKey = Registry.CurrentUser.CreateSubKey(
            $@"Software\Classes\CLSID\{identity.ActivatorId:B}\LocalServer32");
        serverKey.SetValue(null, '"' + identity.ExecutablePath + '"');
    }

    private static void DeleteRegistry()
    {
        string? applicationId;
        Guid activatorId;
        lock (Gate)
        {
            applicationId = _applicationId;
            activatorId = _activatorId;
            _applicationId = null;
        }

        if (applicationId is null)
        {
            return;
        }

        DeleteTree($@"Software\Classes\CLSID\{activatorId:B}");
        DeleteTree($@"Software\Classes\AppUserModelId\{applicationId}");
    }

    private static void DeleteTree(string name)
    {
        using var existing = Registry.CurrentUser.OpenSubKey(name);
        if (existing is null)
        {
            return;
        }

        Registry.CurrentUser.DeleteSubKeyTree(name);
    }

    private static void StartActivator(Guid activatorId)
    {
        _startError = null;
        _ready = new ManualResetEventSlim(false);
        _stop = new ManualResetEventSlim(false);
        _thread = new Thread(() => ActivatorThread(activatorId))
        {
            IsBackground = true,
            Name = "Kirie Windows notifications",
        };
        _thread.Start();
        _ready.Wait();
        if (_startError is not null)
        {
            _thread.Join();
            _thread = null;
            ExceptionDispatchInfo.Capture(_startError).Throw();
        }
    }

    private static void ActivatorThread(Guid activatorId)
    {
        try
        {
            var initialized = WinRtInterop.RoInitialize(RoInitType.MultiThreaded);
            if (initialized.Value < 0 && (uint)initialized.Value != 0x80010106)
            {
                Marshal.ThrowExceptionForHR(initialized.Value);
            }

            EnsureVtables();
            _factory = Allocate(_factoryVtable);
            _activator = Allocate(_activatorVtable);
            WinRtInterop.CoRegisterClassObject(
                activatorId,
                _factory,
                (uint)CLSCTX.CLSCTX_LOCAL_SERVER,
                (uint)REGCLS.REGCLS_MULTIPLEUSE,
                out _cookie).ThrowOnFailure();
            _ready!.Set();
            _stop!.Wait();
            if (_cookie != 0)
            {
                WinRtInterop.CoRevokeClassObject(_cookie).ThrowOnFailure();
                _cookie = 0;
            }
        }
        catch (Exception error)
        {
            _startError = error;
            _ready?.Set();
        }
    }

    private static void OnActivated(char* invokedArgs)
    {
        if (invokedArgs is null)
        {
            return;
        }

        Action<string>? listener;
        SynchronizationContext? context;
        lock (Gate)
        {
            listener = _listener;
            context = _listenerContext;
        }

        if (listener is null || context is null)
        {
            return;
        }

        // The launch argument is the caller's own id, so it goes back unchanged.
        var notificationId = new string(invokedArgs);
        context.Post(_ => listener(notificationId), null);
    }

    private static string ToastXml(NotificationPayload notification)
    {
        var launch = EscapeXml(notification.Id);
        var title = EscapeXml(notification.Title);
        var body = EscapeXml(notification.Body);
        return $"""
            <toast launch="{launch}">
              <visual>
                <binding template="ToastGeneric">
                  <text>{title}</text>
                  <text>{body}</text>
                </binding>
              </visual>
              <audio silent="true"/>
            </toast>
            """;
    }

    private static string EscapeXml(string value)
    {
        var encoded = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            switch (character)
            {
                case '&':
                    encoded.Append("&amp;");
                    break;
                case '<':
                    encoded.Append("&lt;");
                    break;
                case '>':
                    encoded.Append("&gt;");
                    break;
                case '"':
                    encoded.Append("&quot;");
                    break;
                case '\'':
                    encoded.Append("&apos;");
                    break;
                default:
                    if (character is not ('\t' or '\n' or '\r') && character < ' ')
                    {
                        throw new ArgumentException("The notification contains a character XML cannot represent.");
                    }

                    encoded.Append(character);
                    break;
            }
        }

        return encoded.ToString();
    }

    private static void EnsureVtables()
    {
        if (_factoryVtable is not null)
        {
            return;
        }

        _factoryVtable = (nint*)NativeMemory.Alloc(5, (nuint)sizeof(nint));
        _factoryVtable[0] = (nint)(delegate* unmanaged[Stdcall]<void*, Guid*, void**, int>)&FactoryQueryInterface;
        _factoryVtable[1] = (nint)(delegate* unmanaged[Stdcall]<void*, uint>)&AddRef;
        _factoryVtable[2] = (nint)(delegate* unmanaged[Stdcall]<void*, uint>)&Release;
        _factoryVtable[3] = (nint)(delegate* unmanaged[Stdcall]<void*, void*, Guid*, void**, int>)&CreateInstance;
        _factoryVtable[4] = (nint)(delegate* unmanaged[Stdcall]<void*, int, int>)&LockServer;

        _activatorVtable = (nint*)NativeMemory.Alloc(4, (nuint)sizeof(nint));
        _activatorVtable[0] = (nint)(delegate* unmanaged[Stdcall]<void*, Guid*, void**, int>)&ActivatorQueryInterface;
        _activatorVtable[1] = (nint)(delegate* unmanaged[Stdcall]<void*, uint>)&AddRef;
        _activatorVtable[2] = (nint)(delegate* unmanaged[Stdcall]<void*, uint>)&Release;
        _activatorVtable[3] = (nint)(delegate* unmanaged[Stdcall]<void*, char*, char*, void*, uint, int>)&Activate;
    }

    private static void* Allocate(nint* vtable)
    {
        var instance = (void**)NativeMemory.Alloc(2, (nuint)sizeof(nint));
        instance[0] = vtable;
        *(int*)(instance + 1) = 1;
        return instance;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvStdcall)])]
    private static int FactoryQueryInterface(void* self, Guid* iid, void** result) =>
        HandleQueryInterface(self, iid, result, ClassFactoryIid);

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvStdcall)])]
    private static int ActivatorQueryInterface(void* self, Guid* iid, void** result) =>
        HandleQueryInterface(self, iid, result, ActivationIid);

    private static int HandleQueryInterface(void* self, Guid* iid, void** result, Guid interfaceId)
    {
        if (result is null)
        {
            return NoInterface;
        }

        if (iid is null || (*iid != interfaceId && *iid != UnknownIid))
        {
            *result = null;
            return NoInterface;
        }

        AddReference(self);
        *result = self;
        return 0;
    }

    private static uint AddReference(void* self)
    {
        var count = Interlocked.Increment(ref *(int*)((byte*)self + sizeof(nint)));
        return (uint)count;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvStdcall)])]
    private static uint AddRef(void* self) => AddReference(self);

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvStdcall)])]
    private static uint Release(void* self)
    {
        var count = Interlocked.Decrement(ref *(int*)((byte*)self + sizeof(nint)));
        if (count == 0)
        {
            NativeMemory.Free(self);
        }

        return (uint)count;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvStdcall)])]
    private static int CreateInstance(void* self, void* outer, Guid* iid, void** result)
    {
        if (outer is not null)
        {
            return ClassNotAggregatable;
        }

        if (_activator is null)
        {
            return NoInterface;
        }

        return HandleQueryInterface(_activator, iid, result, ActivationIid);
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvStdcall)])]
    private static int LockServer(void* self, int @lock) => 0;

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvStdcall)])]
    private static int Activate(void* self, char* applicationId, char* invokedArgs, void* data, uint dataCount)
    {
        try
        {
            OnActivated(invokedArgs);
            return 0;
        }
        catch
        {
            return unchecked((int)0x80004005);
        }
    }

    private readonly record struct NotificationIdentity(
        string ApplicationId,
        Guid ActivatorId,
        string DisplayName,
        string ExecutablePath);
}
