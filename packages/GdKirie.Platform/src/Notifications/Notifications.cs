using System.Runtime.Versioning;

namespace GdKirie.Platform;

/// <summary>
/// Desktop notifications for one Platform host. The listener is process-wide and
/// platform-specific; this type keeps the contract checks in one place.
/// </summary>
internal static class Notifications
{
    private static Action<string>? _listener;

    public static async Task<EmptyPayload> ShowAsync(
        NotificationPayload notification,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(notification.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(notification.Title);
        ArgumentNullException.ThrowIfNull(notification.Body);
        cancellationToken.ThrowIfCancellationRequested();

        if (OperatingSystem.IsMacOSVersionAtLeast(11))
        {
            await MacOsNotificationRuntime.ShowAsync(notification);
            return new EmptyPayload();
        }

        if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 14393))
        {
            WindowsNotificationRuntime.Show(notification);
            return new EmptyPayload();
        }

        if (OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "Windows desktop notifications require Windows 10 version 1607 or later.");
        }

        throw new PlatformNotSupportedException(
            "Desktop notifications are currently implemented only on macOS 11 or later and Windows 10 version 1607 or later.");
    }

    public static void SetListener(Action<string> onActivated, SynchronizationContext? synchronizationContext)
    {
        _listener = onActivated;

        if (OperatingSystem.IsMacOSVersionAtLeast(11))
        {
            MacOsNotificationRuntime.SetListener(Activate);
            return;
        }

        if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 14393))
        {
            WindowsNotificationRuntime.SetListener(
                Activate,
                synchronizationContext
                    ?? throw new InvalidOperationException(
                        "Windows desktop notifications require Godot's main-thread synchronization context."));
        }
    }

    public static void RemoveListener()
    {
        _listener = null;

        if (OperatingSystem.IsMacOSVersionAtLeast(11))
        {
            MacOsNotificationRuntime.RemoveListener();
            return;
        }

        if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 14393))
        {
            WindowsNotificationRuntime.RemoveListener();
        }
    }

    private static void Activate(string id) => _listener?.Invoke(id);
}
