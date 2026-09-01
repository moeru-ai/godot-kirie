# GdKirie.Platform

`GdKirie.Platform` registers the Godot side of `@gd-kirie/platform` on an
application-owned Kirie Eventa context and exposes desktop host capabilities.

```csharp
var registry = new KirieEventaJsonRegistry();
GdKiriePlatform.Register(registry);

var eventa = kirie.CreateEventaContext(registry);
var platform = GdKiriePlatform.Attach(eventa.Context, GetWindow());
```

`Register` must run before the Eventa context is created. `Attach` borrows the
context and explicit Godot `Window`; disposing the returned
host removes only Platform handlers. It does not dispose the
context or window. Attach and disposal run on Godot's main thread, and the
bound window must be a native, non-embedded window already inside the scene
tree. The host disposes automatically when the bound window exits the tree.

## Global shortcuts

Global shortcuts are implemented on macOS and Windows. macOS uses Carbon
hot-key registration. Windows uses one lazy process-wide low-level keyboard
hook and filters it to the shortcuts owned by attached Platform hosts. Windows
registrations are non-exclusive and do not detect shortcuts used by another
process.

Both backends emit one `pressed` and one `released` state without keyboard
auto-repeat. Native events are delivered on Godot's main thread, and disposing
the host removes its registrations. The Windows hook stops after the final
Windows registration is removed. Linux global-shortcut backends are not yet
implemented.
