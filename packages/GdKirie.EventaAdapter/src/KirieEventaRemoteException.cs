namespace GdKirie.EventaAdapter;

/// <summary>
/// Represents an invoke failure reported by the remote Eventa peer.
/// </summary>
/// <remarks>
/// Creates a remote Eventa exception.
/// </remarks>
public sealed class KirieEventaRemoteException(string message, string? remoteName = null) : Exception(message)
{

    /// <summary>
    /// Gets the remote error name when the peer supplied one.
    /// </summary>
    public string? RemoteName { get; } = remoteName;
}
