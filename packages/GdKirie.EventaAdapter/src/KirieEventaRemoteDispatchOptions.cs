namespace GdKirie.EventaAdapter;

internal sealed class KirieEventaRemoteDispatchOptions
{
    public static KirieEventaRemoteDispatchOptions Instance { get; } = new();

    private KirieEventaRemoteDispatchOptions()
    {
    }
}
