using Eventa;

namespace GdKirie.EventaAdapter;

/// <summary>
/// Owns an Eventa context and its Kirie transport adapter.
/// </summary>
public sealed class KirieEventaContextHandle(IEventContext context, KirieEventaAdapter adapter) : IDisposable
{
    /// <summary>
    /// Gets the Eventa context connected to Kirie text IPC.
    /// </summary>
    public IEventContext Context { get; } = context;

    /// <summary>
    /// Gets the underlying Kirie Eventa adapter.
    /// </summary>
    public KirieEventaAdapter Adapter { get; } = adapter;

    /// <summary>
    /// Disposes the context, adapter, and adapter-owned subscriptions.
    /// </summary>
    public void Dispose()
    {
        Context.Dispose();
    }
}
