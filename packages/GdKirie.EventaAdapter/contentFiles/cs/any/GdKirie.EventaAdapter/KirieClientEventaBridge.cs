using System;
using System.Threading;

namespace GdKirie.EventaAdapter;

/// <summary>
/// Source bridge from addon-shipped KirieClient to GdKirie.EventaAdapter.
/// </summary>
public sealed class KirieClientTextTransport : IKirieTextTransport, IDisposable
{
    private readonly global::KirieClient _client;
    private readonly SynchronizationContext? _synchronizationContext;

    public KirieClientTextTransport(global::KirieClient client)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _synchronizationContext = SynchronizationContext.Current;
        _client.TextReceived += OnTextReceived;
    }

    public event Action<string>? TextReceived;

    public void SendText(string message)
    {
        if (_synchronizationContext is null
            || ReferenceEquals(SynchronizationContext.Current, _synchronizationContext))
        {
            _client.SendText(message);
            return;
        }

        _synchronizationContext.Post(_ => _client.SendText(message), null);
    }

    public void Dispose()
    {
        _client.TextReceived -= OnTextReceived;
    }

    private void OnTextReceived(string message)
    {
        TextReceived?.Invoke(message);
    }
}

public static class KirieClientEventaExtensions
{
    public static KirieEventaContextHandle CreateEventaContext(
        this global::KirieClient client,
        KirieEventaJsonRegistry registry)
    {
        return KirieEventa.CreateContext(new KirieClientTextTransport(client), registry, disposeTransport: true);
    }
}
