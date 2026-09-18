using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Godot;

namespace GdKirie.Platform;

internal sealed partial class MacOsNotificationBackend : IDisposable
{
    private const string ObjectiveCLibrary = "/usr/lib/libobjc.A.dylib";
    private const string UserNotificationsLibrary =
        "/System/Library/Frameworks/UserNotifications.framework/UserNotifications";
    private const string SystemLibrary = "/usr/lib/libSystem.B.dylib";
    private const int BlockIsGlobal = 1 << 28;
    private const nuint AuthorizationOptionAlert = 1 << 2;
    private const nuint PresentationOptionAlert = 1 << 2;
    private const nuint PresentationOptionList = 1 << 3;
    private const nuint PresentationOptionBanner = 1 << 4;

    private static readonly object RuntimeLock = new();
    private static readonly nint UserNotificationsFramework = NativeLibrary.Load(UserNotificationsLibrary);

    // The system can invoke this block after requestAuthorizationWithOptions returns.
    // Keep its native storage for the process lifetime instead of tying it to one host.
    private static readonly nint AuthorizationCompletionBlock = CreateAuthorizationCompletionBlock();
    private static SharedRuntime? _runtime;

    private readonly SharedRuntime _sharedRuntime;
    private readonly string _ownerId = Guid.NewGuid().ToString("N");
    private bool _disposed;

    public MacOsNotificationBackend(Action<string> onActivated)
    {
        lock (RuntimeLock)
        {
            _runtime ??= new SharedRuntime();
            _sharedRuntime = _runtime;
            _sharedRuntime.AddOwner(_ownerId, onActivated);
        }
    }

    public async Task ShowAsync(NotificationPayload notification, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        await _sharedRuntime.EnsureAuthorizationAsync(cancellationToken);
        ObjectDisposedException.ThrowIf(_disposed, this);
        lock (RuntimeLock)
        {
            _sharedRuntime.Show(_ownerId, notification);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        lock (RuntimeLock)
        {
            _sharedRuntime.RemoveOwner(_ownerId);
            if (_sharedRuntime.HasOwners)
            {
                _disposed = true;
                return;
            }

            _sharedRuntime.Dispose();
            _runtime = null;
        }

        _disposed = true;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void AuthorizationCompleted(nint block, byte granted, nint error)
    {
        try
        {
            lock (RuntimeLock)
            {
                _runtime?.CompleteAuthorization(granted != 0, error);
            }
        }
        catch (Exception exception)
        {
            GD.PushError($"Failed to complete macOS notification authorization: {exception}");
        }
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe void WillPresentNotification(
        nint self,
        nint selector,
        nint center,
        nint notification,
        nint completionHandler)
    {
        try
        {
            var block = (BlockLiteral*)completionHandler;
            var complete = (delegate* unmanaged[Cdecl]<nint, nuint, void>)block->Invoke;
            complete(
                completionHandler,
                PresentationOptionAlert | PresentationOptionList | PresentationOptionBanner);
        }
        catch (Exception exception)
        {
            GD.PushError($"Failed to present a macOS notification: {exception}");
        }
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe void DidReceiveNotificationResponse(
        nint self,
        nint selector,
        nint center,
        nint response,
        nint completionHandler)
    {
        try
        {
            var notification = SendIntPtr(response, GetSelector("notification"));
            var request = SendIntPtr(notification, GetSelector("request"));
            var identifier = SendIntPtr(request, GetSelector("identifier"));
            var nativeId = ReadNSString(identifier);

            Action<string>? onActivated;
            var notificationId = string.Empty;
            lock (RuntimeLock)
            {
                onActivated = _runtime?.ResolveActivation(nativeId, out notificationId);
            }

            onActivated?.Invoke(notificationId);
        }
        catch (Exception exception)
        {
            GD.PushError($"Failed to activate a macOS notification: {exception}");
        }
        finally
        {
            var block = (BlockLiteral*)completionHandler;
            var complete = (delegate* unmanaged[Cdecl]<nint, void>)block->Invoke;
            complete(completionHandler);
        }
    }

    private static unsafe nint CreateAuthorizationCompletionBlock()
    {
        var systemLibrary = NativeLibrary.Load(SystemLibrary);
        var descriptor = (BlockDescriptor*)NativeMemory.Alloc((nuint)sizeof(BlockDescriptor));
        descriptor->Reserved = 0;
        descriptor->Size = (nuint)sizeof(BlockLiteral);

        var block = (BlockLiteral*)NativeMemory.Alloc((nuint)sizeof(BlockLiteral));
        block->Isa = NativeLibrary.GetExport(systemLibrary, "_NSConcreteGlobalBlock");
        block->Flags = BlockIsGlobal;
        block->Reserved = 0;
        block->Invoke = (nint)(delegate* unmanaged[Cdecl]<nint, byte, nint, void>)&AuthorizationCompleted;
        block->Descriptor = (nint)descriptor;
        return (nint)block;
    }

    private static nint CreateNSString(string value)
    {
        var valueClass = GetClass("NSString");
        var instance = SendIntPtr(valueClass, GetSelector("alloc"));
        return SendIntPtrUtf8(instance, GetSelector("initWithUTF8String:"), value);
    }

    private static string ReadNSString(nint value)
    {
        if (value == nint.Zero)
        {
            return string.Empty;
        }

        var utf8 = SendIntPtr(value, GetSelector("UTF8String"));
        return Marshal.PtrToStringUTF8(utf8) ?? string.Empty;
    }

    private static string ReadNSError(nint error)
    {
        if (error == nint.Zero)
        {
            return "The operating system rejected notification authorization.";
        }

        var domain = SendIntPtr(error, GetSelector("domain"));
        var code = SendIntPtr(error, GetSelector("code"));
        var description = SendIntPtr(error, GetSelector("localizedDescription"));
        return $"{ReadNSString(description)} ({ReadNSString(domain)} {code})";
    }

    private static nint GetClass(string name)
    {
        var value = ObjectiveCGetClass(name);
        return value != nint.Zero
            ? value
            : throw new InvalidOperationException($"The Objective-C class '{name}' is unavailable.");
    }

    private static nint GetSelector(string name)
    {
        var value = SelectorRegisterName(name);
        return value != nint.Zero
            ? value
            : throw new InvalidOperationException($"The Objective-C selector '{name}' is unavailable.");
    }

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_getClass", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint ObjectiveCGetClass(string name);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_getProtocol", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint ObjectiveCGetProtocol(string name);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "sel_registerName", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint SelectorRegisterName(string name);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_allocateClassPair", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint ObjectiveCAllocateClassPair(nint superclass, string name, nuint extraBytes);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_registerClassPair")]
    private static partial void ObjectiveCRegisterClassPair(nint value);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "class_addProtocol")]
    [return: MarshalAs(UnmanagedType.I1)]
    private static partial bool ClassAddProtocol(nint value, nint protocol);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "class_addMethod", StringMarshalling = StringMarshalling.Utf8)]
    [return: MarshalAs(UnmanagedType.I1)]
    private static partial bool ClassAddMethod(nint value, nint selector, nint implementation, string types);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial nint SendIntPtr(nint receiver, nint selector);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial void SendVoid(nint receiver, nint selector);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial void SendVoidIntPtr(nint receiver, nint selector, nint argument);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial void SendVoidIntPtrIntPtr(
        nint receiver,
        nint selector,
        nint firstArgument,
        nint secondArgument);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial void SendVoidNuintIntPtr(
        nint receiver,
        nint selector,
        nuint firstArgument,
        nint secondArgument);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial nint SendIntPtrIntPtrIntPtrIntPtr(
        nint receiver,
        nint selector,
        nint firstArgument,
        nint secondArgument,
        nint thirdArgument);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint SendIntPtrUtf8(nint receiver, nint selector, string argument);

    [StructLayout(LayoutKind.Sequential)]
    private struct BlockLiteral
    {
        public nint Isa;
        public int Flags;
        public int Reserved;
        public nint Invoke;
        public nint Descriptor;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BlockDescriptor
    {
        public nuint Reserved;
        public nuint Size;
    }

    private sealed class SharedRuntime : IDisposable
    {
        private const string DelegateClassName = "GdKiriePlatformNotificationDelegate";

        private readonly Dictionary<string, Action<string>> _owners = [];
        private readonly nint _center;
        private readonly nint _delegate;
        private TaskCompletionSource<bool>? _authorization;
        private bool _disposed;

        public SharedRuntime()
        {
            _center = SendIntPtr(GetClass("UNUserNotificationCenter"), GetSelector("currentNotificationCenter"));
            if (SendIntPtr(_center, GetSelector("delegate")) != nint.Zero)
            {
                throw new InvalidOperationException(
                    "Desktop notifications require ownership of the macOS user-notification delegate.");
            }

            _delegate = CreateDelegate();
            SendVoidIntPtr(_center, GetSelector("setDelegate:"), _delegate);
        }

        public bool HasOwners => _owners.Count > 0;

        public void AddOwner(string ownerId, Action<string> onActivated)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            _owners.Add(ownerId, onActivated);
        }

        public void RemoveOwner(string ownerId)
        {
            _owners.Remove(ownerId);
        }

        public async Task EnsureAuthorizationAsync(CancellationToken cancellationToken)
        {
            Task<bool> authorizationTask;
            lock (RuntimeLock)
            {
                ObjectDisposedException.ThrowIf(_disposed, this);
                if (_authorization is null)
                {
                    _authorization = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                    SendVoidNuintIntPtr(
                        _center,
                        GetSelector("requestAuthorizationWithOptions:completionHandler:"),
                        AuthorizationOptionAlert,
                        AuthorizationCompletionBlock);
                }

                authorizationTask = _authorization.Task;
            }

            var authorized = await authorizationTask.WaitAsync(cancellationToken);
            if (!authorized)
            {
                throw new UnauthorizedAccessException(
                    "macOS notification permission is not granted for this application.");
            }
        }

        public void CompleteAuthorization(bool granted, nint error)
        {
            if (_authorization is null || _authorization.Task.IsCompleted)
            {
                return;
            }

            if (error != nint.Zero)
            {
                _authorization.SetException(new InvalidOperationException(ReadNSError(error)));
                return;
            }

            _authorization.SetResult(granted);
        }

        public void Show(string ownerId, NotificationPayload notification)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (!_owners.ContainsKey(ownerId))
            {
                throw new ObjectDisposedException(nameof(MacOsNotificationBackend));
            }

            var nativeId = $"{ownerId}:{notification.Id}";
            var content = SendIntPtr(GetClass("UNMutableNotificationContent"), GetSelector("alloc"));
            content = SendIntPtr(content, GetSelector("init"));
            var title = CreateNSString(notification.Title);
            var body = CreateNSString(notification.Body);
            var identifier = CreateNSString(nativeId);

            try
            {
                SendVoidIntPtr(content, GetSelector("setTitle:"), title);
                SendVoidIntPtr(content, GetSelector("setBody:"), body);
                var request = SendIntPtrIntPtrIntPtrIntPtr(
                    GetClass("UNNotificationRequest"),
                    GetSelector("requestWithIdentifier:content:trigger:"),
                    identifier,
                    content,
                    nint.Zero);
                SendVoidIntPtrIntPtr(
                    _center,
                    GetSelector("addNotificationRequest:withCompletionHandler:"),
                    request,
                    nint.Zero);
            }
            finally
            {
                SendVoid(title, GetSelector("release"));
                SendVoid(body, GetSelector("release"));
                SendVoid(identifier, GetSelector("release"));
                SendVoid(content, GetSelector("release"));
            }
        }

        public Action<string>? ResolveActivation(string nativeId, out string notificationId)
        {
            var separator = nativeId.IndexOf(':', StringComparison.Ordinal);
            if (separator < 1)
            {
                notificationId = string.Empty;
                return null;
            }

            var ownerId = nativeId[..separator];
            notificationId = nativeId[(separator + 1)..];
            return _owners.GetValueOrDefault(ownerId);
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _authorization?.TrySetCanceled();
            _owners.Clear();

            if (SendIntPtr(_center, GetSelector("delegate")) == _delegate)
            {
                SendVoidIntPtr(_center, GetSelector("setDelegate:"), nint.Zero);
            }

            SendVoid(_delegate, GetSelector("release"));
        }

        private static unsafe nint CreateDelegate()
        {
            var delegateClass = ObjectiveCGetClass(DelegateClassName);
            if (delegateClass == nint.Zero)
            {
                delegateClass = ObjectiveCAllocateClassPair(GetClass("NSObject"), DelegateClassName, 0);
                if (delegateClass == nint.Zero)
                {
                    throw new InvalidOperationException("Could not allocate the macOS notification delegate class.");
                }

                var protocol = ObjectiveCGetProtocol("UNUserNotificationCenterDelegate");
                if (protocol == nint.Zero || !ClassAddProtocol(delegateClass, protocol))
                {
                    throw new InvalidOperationException("Could not attach the macOS notification delegate protocol.");
                }

                var willPresent = (nint)(delegate* unmanaged[Cdecl]<nint, nint, nint, nint, nint, void>)&WillPresentNotification;
                if (!ClassAddMethod(
                        delegateClass,
                        GetSelector("userNotificationCenter:willPresentNotification:withCompletionHandler:"),
                        willPresent,
                        "v@:@@@?"))
                {
                    throw new InvalidOperationException("Could not register the macOS notification presentation handler.");
                }

                var didReceive = (nint)(delegate* unmanaged[Cdecl]<nint, nint, nint, nint, nint, void>)&DidReceiveNotificationResponse;
                if (!ClassAddMethod(
                        delegateClass,
                        GetSelector("userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:"),
                        didReceive,
                        "v@:@@@?"))
                {
                    throw new InvalidOperationException("Could not register the macOS notification activation handler.");
                }

                ObjectiveCRegisterClassPair(delegateClass);
            }

            var instance = SendIntPtr(delegateClass, GetSelector("alloc"));
            return SendIntPtr(instance, GetSelector("init"));
        }
    }
}
