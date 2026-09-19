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

`openExternalUrl()` accepts only absolute HTTP and HTTPS URLs. The host passes
accepted URLs to
[`OS.shell_open()`](https://docs.godotengine.org/en/4.7/classes/class_os.html#class-os-method-shell-open).

`openApplicationDataDirectory()` opens and returns the current project's
[`OS.get_user_data_dir()`](https://docs.godotengine.org/en/4.7/classes/class_os.html#class-os-method-get-user-data-dir).
It does not accept an arbitrary path.

Host-window state uses Godot's `Window.Visible`, `Window.HasFocus()`, and
`Window.Mode`. Platform emits a state event when the bound window reports a
focus, visibility, or size change. The browser must request the first state
snapshot before the host emits changes. This prevents state events before the
WebView is ready. Duplicate snapshots are not emitted.

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

## Desktop notifications

On macOS 11 or later, RumpSharp requests permission, posts silent notifications,
and reports their caller-owned IDs when clicked. Callbacks end when the host is
disposed and do not survive a cold launch.

RumpSharp owns the process UserNotifications delegate and runs in-process; do
not install a second delegate while a Platform host is active. Windows and
Linux calls fail with `PlatformNotSupportedException`.
