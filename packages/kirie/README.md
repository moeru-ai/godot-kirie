# @gd-kirie/kirie

This package contains the Kirie plugin sources and platform-specific native
implementations.

Current layout:

- `addon/addons/kirie`: Godot-facing plugin files
- `addon/addons/kirie/csharp`: C# wrapper files for Godot .NET projects
- `native/android`: Android implementation
- `native/ios`: iOS implementation

The goal of this package is to stay small until the WebView IPC surface is proven
in a real example project.

## C# binding

`addon/addons/kirie/csharp/KirieClient.cs` is a thin C# wrapper over the same
platform singleton used by `GdKirie`. It exposes Kirie signals as idiomatic C#
events while keeping Godot `Callable` usage internal to the bridge.

TODO: Add a platform integration smoke test for `KirieClient` that subscribes
through C# events and verifies a WebView IPC round-trip.

```csharp
private readonly KirieClient _kirie = new();

public override void _Ready()
{
    _kirie.WebViewReady += OnWebViewReady;
    _kirie.IpcMessageReceived += OnIpcMessageReceived;
    _kirie.IpcError += GD.PushError;

    if (_kirie.IsAvailable)
    {
        _kirie.CreateWebView("res://web/dist/index.html");
    }
}
```
