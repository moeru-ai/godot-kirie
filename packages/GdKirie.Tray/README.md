# GdKirie.Tray

`GdKirie.Tray` supplies the Godot host for `@gd-kirie/tray`. It borrows the
application's existing Kirie Eventa registry and context.

```csharp
var registry = GdKirieTray.Register(new KirieEventaJsonRegistry());
var eventa = kirie.CreateEventaContext(registry);
var tray = GdKirieTray.Attach(eventa.Context, GetWindow());
```

`Register` must run before creating the Eventa context. `Attach` must run on
Godot's main thread with a window already inside the scene tree. Disposing the
returned host removes only Tray handlers and resources.

The returned host also exposes its `TrayController` for direct C# calls:

```csharp
tray.Tray.Configure(new TrayConfiguration(
    "res://tray-template.svg",
    "Kirie")
{
    IconAsTemplate = true,
});
tray.Tray.SetMenu([
    new("show", "Show Kirie"),
    new("enabled", "Enabled", "check", Checked: true),
]);
```

IDs are unique across the menu tree. `SetMenu` replaces the tree and
`UpdateItem` changes an item by ID. C# may pass a `Texture2D` directly or set
`Texture` on a menu item.

On macOS, template artwork should use black and transparency as described by
Apple [`NSImage.isTemplate`](https://developer.apple.com/documentation/appkit/nsimage/istemplate).
Passing `IconAsTemplate: true` outside macOS fails with
`PlatformNotSupportedException`. Other hosts use Godot's status-indicator
support and fail when the active display server does not provide it.
