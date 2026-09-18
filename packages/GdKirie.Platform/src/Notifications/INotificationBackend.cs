namespace GdKirie.Platform;

internal interface INotificationBackend : IDisposable
{
    Task ShowAsync(NotificationPayload notification, CancellationToken cancellationToken);
}
