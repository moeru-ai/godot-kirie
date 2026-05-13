# @gd-kirie/kirie

This package contains the Kirie plugin sources and platform-specific native
implementations.

Current layout:

- `addon/addons/kirie`: Godot-facing plugin files
- `addon/addons/kirie/csharp`: C# wrapper files for Godot .NET projects
- `native/android`: Android implementation
- `native/ios`: iOS implementation

The goal of this package is to stay small while the WebView IPC surface is
proven in real example and integration projects. Native code owns raw byte
packet lanes for text, binary, and data messages; the current GDScript and
browser layers encode those bytes as CBOR packets until the packet contract is
stable enough to consider native codec support.

## C# binding

`addon/addons/kirie/csharp/KirieClient.cs` is a thin C# wrapper over the same
platform singleton used by `GdKirie`. It exposes Kirie signals as idiomatic C#
events while keeping Godot `Callable` usage internal to the bridge. It exposes
typed text, binary, and data lane helpers on top of raw packet methods. The
typed data lane uses the same CBOR subset as GDScript and JavaScript: null,
booleans, finite numbers, strings, arrays, and string-key maps. Integer values
must stay inside the JavaScript safe integer range. Byte arrays belong to the
binary lane. C# accepts bounded collection and dictionary shapes for caller
ergonomics, but lazy `IEnumerable` values are rejected because the packet length
must be known before encoding.

```csharp
private readonly KirieClient _kirie = new();

public override void _Ready()
{
    _kirie.WebViewReady += OnWebViewReady;
    _kirie.DataReceived += OnDataReceived;
    _kirie.IpcError += GD.PushError;

    if (_kirie.IsAvailable)
    {
        _kirie.CreateWebView("res://web/dist/index.html");
    }
}
```
