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

Desktop notifications are implemented on macOS 11 or later with RumpSharp and
the UserNotifications framework. The first notification asks macOS for
notification authorization. Notifications remain visible while the app is in
the foreground and do not play a sound.

RumpSharp requests alert, sound, and badge authorization. Kirie sends silent
notifications and does not set the application badge.

The browser supplies a non-empty notification ID and title. When the user
clicks a notification, the host emits the same ID through the borrowed Eventa
context. Disposing the Platform host removes its activation callbacks. Kirie
does not retain an activation across a cold app launch.

RumpSharp uses the one UserNotifications delegate for the process. Do not
install a second delegate while a Platform host is active. Kirie forces the
in-process transport, so RumpSharp does not start its optional helper.

Windows and Linux notification backends are not implemented. Calls on those
platforms fail with `PlatformNotSupportedException`.
