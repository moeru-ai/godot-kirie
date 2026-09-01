using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class Main : Node
{
    private KirieClient? _kirie;
    private KirieEventaContextHandle? _eventa;
    private GdKiriePlatformHost? _platform;

    public override void _Ready()
    {
        _kirie = KirieClient.FromNode(GetNode("KirieNode"));
        if (!_kirie.IsAvailable)
        {
            GD.PushError("Kirie is unavailable on this platform.");
            return;
        }

        var registry = GdKiriePlatform.Register(new KirieEventaJsonRegistry());
        _eventa = _kirie.CreateEventaContext(registry);
        _platform = GdKiriePlatform.Attach(_eventa.Context, GetWindow());
        _kirie.IpcError += GD.PushError;

        var initialUrl = _kirie.GetLaunchOption("kirie-web-url").Trim();
        if (initialUrl.Length == 0)
        {
            initialUrl = "res://src-web/dist/index.html";
        }

        _kirie.CreateWebView(initialUrl);
    }

    public override void _ExitTree()
    {
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
    }
}
