using GdKirie.EventaAdapter;
using GdKirie.Platform;
using Godot;

public partial class Main : Node
{
    private const string PageUrl = "res://src-web/dist/index.html";

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
        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += GD.PushError;
        _kirie.CreateWebView();
    }

    public override void _ExitTree()
    {
        _platform?.Dispose();
        _eventa?.Dispose();
        _kirie?.Dispose();
    }

    private void OnWebViewReady()
    {
        _kirie!.LoadUrl(PageUrl);
    }
}
