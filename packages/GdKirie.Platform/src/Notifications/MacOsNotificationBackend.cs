using System.Runtime.Versioning;
using RumpSharp;

namespace GdKirie.Platform;

[SupportedOSPlatform("macos11.0")]
internal sealed class MacOsNotificationBackend : INotificationBackend
{
    private static readonly object RuntimeLock = new();
    private static readonly Dictionary<string, Action<string>> Owners = [];
    private static NotificationCenter? _center;

    private readonly string _ownerId = Guid.NewGuid().ToString("N");
    private bool _disposed;

    public MacOsNotificationBackend(Action<string> onActivated)
    {
        lock (RuntimeLock)
        {
            if (_center is null)
            {
                _center = new NotificationCenter(new NotificationCenterOptions
                {
                    Transport = NotificationTransport.InProcess,
                    BecomeAccessoryApplication = false,
                    PresentWhenForeground = true,
                    RequestAuthorizationOnDemand = false,
                });
                _center.Activated += OnActivated;
            }

            Owners.Add(_ownerId, onActivated);
        }
    }

    public async Task ShowAsync(NotificationPayload notification, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        var center = _center!;
        var authorized = await Task.Run(
            () => center.RequestAuthorization(TimeSpan.FromMinutes(2)))
            .WaitAsync(cancellationToken);
        if (!authorized)
        {
            throw new UnauthorizedAccessException(
                center.LastAuthorizationError
                ?? "macOS notification permission is not granted for this application.");
        }

        await center.ShowAsync(new Notification(notification.Title, body: notification.Body)
        {
            Identifier = $"{_ownerId}:{notification.Id}",
            PlaySound = false,
        }, cancellationToken);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        lock (RuntimeLock)
        {
            Owners.Remove(_ownerId);
            if (Owners.Count == 0)
            {
                _center!.Activated -= OnActivated;
                _center.Dispose();
                _center = null;
            }

            _disposed = true;
        }
    }

    private static void OnActivated(object? sender, NotificationResponse response)
    {
        if (response.Activation != NotificationActivation.Default)
        {
            return;
        }

        var separator = response.Identifier.IndexOf(':', StringComparison.Ordinal);
        if (separator < 1)
        {
            return;
        }

        Action<string>? onActivated;
        lock (RuntimeLock)
        {
            onActivated = Owners.GetValueOrDefault(response.Identifier[..separator]);
        }

        onActivated?.Invoke(response.Identifier[(separator + 1)..]);
    }
}
