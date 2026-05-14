namespace GdKirie.EventaAdapter;

/// <summary>
/// Represents an invoke failure reported by the remote Eventa peer.
/// </summary>
public sealed class KirieEventaRemoteException : Exception
{
    /// <summary>
    /// Creates a remote Eventa exception.
    /// </summary>
    public KirieEventaRemoteException(string message, string? remoteName = null)
        : base(message)
    {
        RemoteName = remoteName;
    }

    /// <summary>
    /// Gets the remote error name when the peer supplied one.
    /// </summary>
    public string? RemoteName { get; }
}
