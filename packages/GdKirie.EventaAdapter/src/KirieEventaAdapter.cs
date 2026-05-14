using Eventa;

namespace GdKirie.EventaAdapter;

/// <summary>
/// Bridges Eventa context activity to Kirie text IPC.
/// </summary>
public sealed class KirieEventaAdapter : IEventaAdapter
{
    private readonly IKirieTextTransport _transport;
    private readonly KirieEventaJsonRegistry _registry;
    private readonly bool _disposeTransport;
    private IEventContext? _context;
    private bool _disposed;

    internal KirieEventaAdapter(
        IKirieTextTransport transport,
        KirieEventaJsonRegistry registry,
        bool disposeTransport)
    {
        _transport = transport;
        _registry = registry;
        _disposeTransport = disposeTransport;
        _transport.TextReceived += OnTransportTextReceived;
    }

    /// <summary>
    /// Raised when the adapter drops malformed, unknown, or unserializable traffic.
    /// </summary>
    public event Action<KirieEventaError>? Error;

    internal void AttachContext(IEventContext context)
    {
        _context = context;
    }

    /// <inheritdoc />
    public void OnSent(string eventId, object? envelope, object? options = null)
    {
        if (_disposed || options is KirieEventaRemoteDispatchOptions)
        {
            return;
        }

        if (envelope is null)
        {
            ReportError($"Cannot send Eventa event '{eventId}' because its envelope is null.");
            return;
        }

        if (!_registry.TryCreateOutboundMessage(eventId, envelope, out var message, out var error))
        {
            ReportError($"Cannot send unregistered Eventa event '{eventId}'.", error);
            return;
        }

        try
        {
            _transport.SendText(message.ToJson());
        }
        catch (Exception exception)
        {
            ReportError($"Failed to send Eventa event '{eventId}' over Kirie text IPC.", exception);
        }
    }

    /// <inheritdoc />
    public void OnReceived(string eventId, object? envelope)
    {
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _transport.TextReceived -= OnTransportTextReceived;

        if (_disposeTransport && _transport is IDisposable disposableTransport)
        {
            disposableTransport.Dispose();
        }
    }

    private void OnTransportTextReceived(string message)
    {
        if (_disposed)
        {
            return;
        }

        if (_context is null)
        {
            ReportError("Cannot dispatch inbound Eventa text before the context is attached.", rawMessage: message);
            return;
        }

        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(message);
            if (!TryReadMessage(document.RootElement, out var type, out var body))
            {
                ReportError("Dropped malformed Kirie Eventa message.", rawMessage: message);
                return;
            }

            if (!_registry.TryDispatchInbound(type, body, _context, out var error))
            {
                ReportError($"Dropped unregistered or invalid Kirie Eventa message '{type}'.", error, message);
            }
        }
        catch (Exception exception)
        {
            ReportError("Failed to parse Kirie Eventa message.", exception, message);
        }
    }

    private static bool TryReadMessage(
        System.Text.Json.JsonElement root,
        out string type,
        out System.Text.Json.JsonElement body)
    {
        type = string.Empty;
        body = default;

        if (root.ValueKind is not System.Text.Json.JsonValueKind.Object
            || !root.TryGetProperty("type", out var typeElement)
            || typeElement.ValueKind is not System.Text.Json.JsonValueKind.String)
        {
            return false;
        }

        if (!root.TryGetProperty("payload", out var payload)
            || payload.ValueKind is not System.Text.Json.JsonValueKind.Object
            || !payload.TryGetProperty("body", out body))
        {
            return false;
        }

        type = typeElement.GetString() ?? string.Empty;
        return type.Length > 0;
    }

    private void ReportError(
        string message,
        Exception? exception = null,
        string? rawMessage = null)
    {
        Error?.Invoke(new KirieEventaError(message, exception, rawMessage));
    }
}
