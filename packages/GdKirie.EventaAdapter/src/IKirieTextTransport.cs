namespace GdKirie.EventaAdapter;

/// <summary>
/// Minimal text-lane transport required by the Eventa adapter.
/// </summary>
public interface IKirieTextTransport
{
    /// <summary>
    /// Raised when Kirie receives one text IPC payload from the WebView peer.
    /// </summary>
    event Action<string>? TextReceived;

    /// <summary>
    /// Sends one text IPC payload to the WebView peer.
    /// </summary>
    void SendText(string message);
}
