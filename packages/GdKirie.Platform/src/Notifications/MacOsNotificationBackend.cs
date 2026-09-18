using System.Runtime.Versioning;
using RumpSharp;

namespace GdKirie.Platform;

[SupportedOSPlatform("macos11.0")]
internal sealed class MacOsNotificationBackend : INotificationBackend
{
    private static readonly object RuntimeLock = new();
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

    public Task ShowAsync(NotificationPayload notification, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return _sharedRuntime.ShowAsync(_ownerId, notification, cancellationToken);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        lock (RuntimeLock)
        {
            if (_sharedRuntime.RemoveOwner(_ownerId))
            {
                _sharedRuntime.Dispose();
                _runtime = null;
            }

            _disposed = true;
        }
    }

    private sealed class SharedRuntime : IDisposable
    {
        private readonly Dictionary<string, Action<string>> _owners = [];
        private readonly NotificationCenter _center;

        public SharedRuntime()
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

        public void AddOwner(string ownerId, Action<string> onActivated)
        {
            _owners.Add(ownerId, onActivated);
        }

        public bool RemoveOwner(string ownerId)
        {
            _owners.Remove(ownerId);
            return _owners.Count == 0;
        }

        public async Task ShowAsync(
            string ownerId,
            NotificationPayload notification,
            CancellationToken cancellationToken)
        {
            lock (RuntimeLock)
            {
                if (!_owners.ContainsKey(ownerId))
                {
                    throw new ObjectDisposedException(nameof(MacOsNotificationBackend));
                }
            }

            var authorized = await Task.Run(
                () => _center.RequestAuthorization(TimeSpan.FromMinutes(2)))
                .WaitAsync(cancellationToken);
            if (!authorized)
            {
                throw new UnauthorizedAccessException(
                    _center.LastAuthorizationError
                    ?? "macOS notification permission is not granted for this application.");
            }

            var nativeId = $"{ownerId}:{notification.Id}";
            await _center.ShowAsync(new Notification(notification.Title, body: notification.Body)
            {
                Identifier = nativeId,
                PlaySound = false,
            }, cancellationToken);
        }

        public void Dispose()
        {
            _owners.Clear();
            _center.Activated -= OnActivated;
            _center.Dispose();
        }

        private void OnActivated(object? sender, NotificationResponse response)
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
                onActivated = _owners.GetValueOrDefault(response.Identifier[..separator]);
            }

            onActivated?.Invoke(response.Identifier[(separator + 1)..]);
        }
    }
}
