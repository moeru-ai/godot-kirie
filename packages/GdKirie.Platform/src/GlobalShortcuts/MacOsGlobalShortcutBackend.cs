using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Godot;

namespace GdKirie.Platform;

// ADR-0002: global shortcuts use Godot logical keys with narrow native backends.
// See: docs/decisions/0002-add-system-wide-global-shortcuts.md
[SupportedOSPlatform("macos")]
internal sealed partial class MacOsGlobalShortcutBackend : IGlobalShortcutBackend
{
    private const string CarbonLibrary = "/System/Library/Frameworks/Carbon.framework/Carbon";
    private const int EventNotHandledError = -9874;
    private const uint EventClassKeyboard = 0x6B657962; // 'keyb'
    private const uint EventHotKeyPressed = 5;
    private const uint EventHotKeyReleased = 6;
    private const uint EventParamDirectObject = 0x2D2D2D2D; // '----'
    private const uint TypeEventHotKeyId = 0x686B6964; // 'hkid'
    private const uint HotKeySignature = 0x4B697269; // 'Kiri'
    private const uint HotKeyNoOptions = 0;
    private const uint CommandKey = 1 << 8;
    private const uint ShiftKey = 1 << 9;
    private const uint OptionKey = 1 << 11;
    private const uint ControlKey = 1 << 12;

    private static int _nextHotKeyId;

    private readonly Dictionary<uint, Action<string>> _callbacks = [];
    private readonly HashSet<uint> _pressedHotKeyIds = [];
    private readonly GCHandle _selfHandle;
    private nint _eventHandler;
    private bool _disposed;

    public unsafe MacOsGlobalShortcutBackend()
    {
        _selfHandle = GCHandle.Alloc(this);
        var eventTypes = stackalloc EventTypeSpec[]
        {
            new(EventClassKeyboard, EventHotKeyPressed),
            new(EventClassKeyboard, EventHotKeyReleased),
        };
        var status = InstallEventHandler(
            GetApplicationEventTarget(),
            (nint)(delegate* unmanaged[Cdecl]<nint, nint, nint, int>)&HandleEvent,
            2,
            eventTypes,
            GCHandle.ToIntPtr(_selfHandle),
            out _eventHandler);
        if (status == 0)
        {
            return;
        }

        _selfHandle.Free();
        throw CreateCarbonException(nameof(InstallEventHandler), status);
    }

    public IDisposable Register(GlobalShortcut shortcut, Action<string> onKeyEvent)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var virtualKeycode = MacOsKeycodeMap.Resolve(shortcut.Keycode);
        var modifiers = GetModifiers(shortcut);
        var id = NextHotKeyId();
        var hotKeyId = new EventHotKeyId(HotKeySignature, id);
        var status = RegisterEventHotKey(
            virtualKeycode,
            modifiers,
            hotKeyId,
            GetApplicationEventTarget(),
            HotKeyNoOptions,
            out var nativeRegistration);
        if (status != 0)
        {
            throw CreateCarbonException(nameof(RegisterEventHotKey), status);
        }

        _callbacks.Add(id, onKeyEvent);
        return new NativeRegistration(this, id, nativeRegistration);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        if (_callbacks.Count > 0)
        {
            throw new InvalidOperationException("All macOS global shortcuts must be unregistered before disposing the backend.");
        }

        var status = RemoveEventHandler(_eventHandler);
        if (status != 0)
        {
            throw CreateCarbonException(nameof(RemoveEventHandler), status);
        }

        _eventHandler = nint.Zero;
        _selfHandle.Free();
        _disposed = true;
    }

    private void Unregister(uint id, nint nativeRegistration)
    {
        var status = UnregisterEventHotKey(nativeRegistration);
        if (status != 0)
        {
            throw CreateCarbonException(nameof(UnregisterEventHotKey), status);
        }

        _callbacks.Remove(id);
        _pressedHotKeyIds.Remove(id);
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static int HandleEvent(nint handlerCall, nint eventRef, nint userData)
    {
        try
        {
            var handle = GCHandle.FromIntPtr(userData);
            if (handle.Target is not MacOsGlobalShortcutBackend backend)
            {
                return EventNotHandledError;
            }

            return backend.DispatchEvent(eventRef);
        }
        catch (Exception error)
        {
            GD.PushError($"Failed to dispatch a macOS global shortcut event: {error}");
            return 0;
        }
    }

    private int DispatchEvent(nint eventRef)
    {
        var status = GetEventParameter(
            eventRef,
            EventParamDirectObject,
            TypeEventHotKeyId,
            nint.Zero,
            (nuint)Unsafe.SizeOf<EventHotKeyId>(),
            nint.Zero,
            out var hotKeyId);
        if (status != 0 || hotKeyId.Signature != HotKeySignature)
        {
            return EventNotHandledError;
        }

        if (!_callbacks.TryGetValue(hotKeyId.Id, out var callback))
        {
            return EventNotHandledError;
        }

        var kind = GetEventKind(eventRef);
        string state;
        if (kind == EventHotKeyPressed)
        {
            if (!_pressedHotKeyIds.Add(hotKeyId.Id))
            {
                return 0;
            }

            state = "pressed";
        }
        else if (kind == EventHotKeyReleased)
        {
            if (!_pressedHotKeyIds.Remove(hotKeyId.Id))
            {
                return 0;
            }

            state = "released";
        }
        else
        {
            return EventNotHandledError;
        }

        callback(state);
        return 0;
    }

    private static uint GetModifiers(GlobalShortcut shortcut)
    {
        var modifiers = 0U;
        if (shortcut.MetaPressed)
        {
            modifiers |= CommandKey;
        }

        if (shortcut.ShiftPressed)
        {
            modifiers |= ShiftKey;
        }

        if (shortcut.AltPressed)
        {
            modifiers |= OptionKey;
        }

        if (shortcut.CtrlPressed)
        {
            modifiers |= ControlKey;
        }

        return modifiers;
    }

    private static uint NextHotKeyId()
    {
        var id = unchecked((uint)Interlocked.Increment(ref _nextHotKeyId));
        if (id == 0)
        {
            id = unchecked((uint)Interlocked.Increment(ref _nextHotKeyId));
        }

        return id;
    }

    private static Exception CreateCarbonException(string operation, int status)
    {
        return new InvalidOperationException($"Carbon {operation} failed with OSStatus {status}.");
    }

    [LibraryImport(CarbonLibrary)]
    private static partial nint GetApplicationEventTarget();

    [LibraryImport(CarbonLibrary)]
    private static unsafe partial int InstallEventHandler(
        nint target,
        nint handler,
        nuint eventTypeCount,
        EventTypeSpec* eventTypes,
        nint userData,
        out nint eventHandler);

    [LibraryImport(CarbonLibrary)]
    private static partial int RemoveEventHandler(nint eventHandler);

    [LibraryImport(CarbonLibrary)]
    private static partial int RegisterEventHotKey(
        uint virtualKeycode,
        uint modifiers,
        EventHotKeyId hotKeyId,
        nint target,
        uint options,
        out nint registration);

    [LibraryImport(CarbonLibrary)]
    private static partial int UnregisterEventHotKey(nint registration);

    [LibraryImport(CarbonLibrary)]
    private static partial uint GetEventKind(nint eventRef);

    [LibraryImport(CarbonLibrary)]
    private static partial int GetEventParameter(
        nint eventRef,
        uint name,
        uint desiredType,
        nint actualType,
        nuint bufferSize,
        nint actualSize,
        out EventHotKeyId data);

    [StructLayout(LayoutKind.Sequential)]
    private readonly record struct EventTypeSpec(uint EventClass, uint EventKind);

    [StructLayout(LayoutKind.Sequential)]
    private readonly record struct EventHotKeyId(uint Signature, uint Id);

    private sealed class NativeRegistration(
        MacOsGlobalShortcutBackend owner,
        uint id,
        nint nativeRegistration) : IDisposable
    {
        private bool _disposed;

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            owner.Unregister(id, nativeRegistration);
            _disposed = true;
        }
    }
}
