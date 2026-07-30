# @gd-kirie/kirie

This package contains the Kirie plugin sources and platform-specific native
implementations.

`@gd-kirie/kirie` is a private workspace container for the Godot addon and
native plugin sources. It is not a public npm package and does not own a package
build pipeline. Native artifacts and the downloadable addon zip are built by the
repository-level mise tasks documented in
[docs/addon-release.md](../../docs/addon-release.md).

Current layout:

- `addon/addons/kirie`: Godot-facing plugin files
- `addon/addons/kirie/csharp`: C# wrapper files for Godot .NET projects
- `native/android`: Android implementation
- `native/ios`: iOS implementation

The goal of this package is to keep the Godot addon tree and native sources
close together while package-published JavaScript lives in the sibling
workspace packages.

## C# binding

`addon/addons/kirie/csharp/KirieClient.cs` exposes Kirie signals as idiomatic
C# events while keeping Godot `Callable` usage internal. Its default constructor
talks directly to the platform singleton:

```csharp
private readonly KirieClient _kirie = new();

public override void _Ready()
{
    _kirie.WebViewReady += OnWebViewReady;
    _kirie.TextReceived += OnTextReceived;
    _kirie.BinaryReceived += OnBinaryReceived;
    _kirie.DataReceived += OnDataReceived;
    _kirie.IpcError += GD.PushError;

    if (_kirie.IsAvailable)
    {
        _kirie.CreateWebView("res://src-web/dist/index.html");
    }
}
```

When a scene `KirieNode` owns the WebView, C# can borrow that existing node
without creating another owner or duplicating dynamic signal plumbing. This
example configures the scene node with `auto_create = false`, then lets C# start
the borrowed node's WebView after subscribing to its signals:

```csharp
private KirieClient? _kirie;

public override void _Ready()
{
    _kirie = KirieClient.FromNode(GetNode<Node>("Kirie"));
    _kirie.TextReceived += OnTextReceived;
    _kirie.CreateWebView();
}

public override void _ExitTree()
{
    _kirie?.Dispose();
    _kirie = null;
}
```

The borrowed node must outlive the client. Disposing the client disconnects its
C# callbacks but does not free the node or destroy its WebView; `KirieNode`
remains the scene-tree lifecycle owner.
