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

`addon/addons/kirie/csharp/KirieClient.cs` is a thin C# wrapper over the same
platform singleton used by `GdKirie`. It exposes Kirie signals as idiomatic C#
events while keeping Godot `Callable` usage internal to the bridge.

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
