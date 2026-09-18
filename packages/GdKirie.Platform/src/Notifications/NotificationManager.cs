namespace GdKirie.Platform;

internal sealed class NotificationManager(
    Action<NotificationActivatedPayload> onActivated,
    SynchronizationContext? synchronizationContext) : IDisposable
{
    private readonly Action<NotificationActivatedPayload> _onActivated = onActivated;
    private readonly SynchronizationContext? _synchronizationContext = synchronizationContext;
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

        await GetBackend().ShowAsync(notification, cancellationToken);
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

    private INotificationBackend GetBackend()
    {
        if (_backend is not null)
        {
            return _backend;
        }

        if (OperatingSystem.IsMacOSVersionAtLeast(11))
        {
            _backend = new MacOsNotificationBackend(DispatchActivation);
            return _backend;
        }

        throw new PlatformNotSupportedException(
            "Desktop notifications are currently implemented only on macOS 11 or later.");
    }

    private void DispatchActivation(string id)
    {
        if (_synchronizationContext is null || SynchronizationContext.Current == _synchronizationContext)
        {
            _onActivated(new NotificationActivatedPayload(id));
            return;
        }

        _synchronizationContext.Post(
            _ => _onActivated(new NotificationActivatedPayload(id)),
            null);
    }
}
