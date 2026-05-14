using Eventa;

namespace GdKirie.EventaAdapter;

/// <summary>
/// Entry point for creating Eventa contexts connected to Kirie text IPC.
/// </summary>
public static class KirieEventa
{
    /// <summary>
    /// Creates an Eventa context that mirrors registered Eventa envelopes over Kirie text IPC.
    /// </summary>
    public static KirieEventaContextHandle CreateContext(
        IKirieTextTransport transport,
        KirieEventaJsonRegistry registry,
        bool disposeTransport = false)
    {
        ArgumentNullException.ThrowIfNull(transport);
        ArgumentNullException.ThrowIfNull(registry);

        var adapter = new KirieEventaAdapter(transport, registry, disposeTransport);
        var context = EventContext.Create(adapter);
        adapter.AttachContext(context);
        return new KirieEventaContextHandle(context, adapter);
    }
}
