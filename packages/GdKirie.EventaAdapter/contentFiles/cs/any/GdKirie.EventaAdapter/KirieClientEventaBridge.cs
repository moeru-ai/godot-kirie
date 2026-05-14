using System;

namespace GdKirie.EventaAdapter;

/// <summary>
/// Source bridge from addon-shipped KirieClient to GdKirie.EventaAdapter.
/// </summary>
public sealed class KirieClientTextTransport : IKirieTextTransport, IDisposable
{
    private readonly global::KirieClient _client;

    public KirieClientTextTransport(global::KirieClient client)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _client.TextReceived += OnTextReceived;
    }

    public event Action<string>? TextReceived;

    public void SendText(string message)
    {
        _client.SendText(message);
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
