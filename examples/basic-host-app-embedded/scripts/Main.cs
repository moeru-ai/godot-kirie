using Godot;

public partial class Main : Control
{
    private Button _godotButton = null!;
    private Control _glow = null!;
    private EmbeddedWebBridge? _bridge;
    private double _elapsed;
    private int _godotButtonTapCount;

    public override void _Ready()
    {
        _godotButton = GetNode<Button>("GodotButton");
        _glow = GetNode<Control>("Glow");
        _godotButton.Pressed += OnGodotButtonPressed;

        var kirie = KirieClient.FromNode(GetNode<Node>("Kirie"));
        kirie.PointerInputForwardingEnabled = true;

        _bridge = new EmbeddedWebBridge(kirie);
        _bridge.Start();

        GD.Print("KIRIE_SWIFT_EMBED_GODOT_READY");
    }

    public override void _Process(double delta)
    {
        _elapsed += delta;
        var x = 72.0f + (float)((Math.Sin(_elapsed * 0.8) + 1.0) * 250.0);
        var y = 250.0f + (float)(Math.Cos(_elapsed * 0.55) * 75.0);
        _glow.Position = new Vector2(x, y);
        _glow.Rotation = (float)(_elapsed * 0.18);
    }

    private void OnGodotButtonPressed()
    {
        _godotButtonTapCount += 1;
        _godotButton.Text = $"Godot button • tap {_godotButtonTapCount}";
        GD.Print($"KIRIE_EMBED_GODOT_BUTTON_TAP count={_godotButtonTapCount}");
    }

    public override void _ExitTree()
    {
        _godotButton.Pressed -= OnGodotButtonPressed;

        if (_bridge is null)
        {
            return;
        }

        _bridge.Dispose();
    }
}
