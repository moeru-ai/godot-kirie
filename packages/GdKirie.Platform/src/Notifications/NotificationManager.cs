namespace GdKirie.Platform;

internal sealed class NotificationManager(Action<string> onActivated) : IDisposable
{
    private readonly Action<string> _onActivated = onActivated;
    private INotificationBackend? _backend;
    private bool _disposed;

    public async Task<EmptyPayload> ShowAsync(
        NotificationPayload notification,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentException.ThrowIfNullOrWhiteSpace(notification.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(notification.Title);
        ArgumentNullException.ThrowIfNull(notification.Body);

        await Backend.ShowAsync(notification, cancellationToken);
        return new EmptyPayload();
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _backend?.Dispose();
    }

    private INotificationBackend Backend => _backend ??=
        OperatingSystem.IsMacOSVersionAtLeast(11)
            ? new MacOsNotificationBackend(_onActivated)
            : throw new PlatformNotSupportedException(
                "Desktop notifications are currently implemented only on macOS 11 or later.");
}

internal interface INotificationBackend : IDisposable
{
    Task ShowAsync(NotificationPayload notification, CancellationToken cancellationToken);
}
