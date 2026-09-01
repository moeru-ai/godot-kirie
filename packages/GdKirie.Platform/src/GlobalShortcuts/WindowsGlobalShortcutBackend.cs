using System.Runtime.Versioning;

namespace GdKirie.Platform;

[SupportedOSPlatform("windows10.0")]
internal sealed class WindowsGlobalShortcutBackend(
    SynchronizationContext synchronizationContext) : IGlobalShortcutBackend
{
    private bool _disposed;

    public IDisposable Register(GlobalShortcut shortcut, Action<string> onKeyEvent)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var keycode = WindowsKeycodeMap.Resolve(shortcut.Keycode);
        return WindowsGlobalShortcutRuntime.Shared.Register(
            keycode,
            shortcut,
            synchronizationContext,
            onKeyEvent);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
    }
}
