# Architecture Notes

Current repository scope is intentionally constrained.

We are standardizing only the minimum plugin shape needed to support:

- a Godot-facing Kirie service
- a scene-friendly KirieView node
- Android and iOS native WebView implementations
- an example project used for integration testing

Anything beyond that, such as dedicated protocol packages, CLI tooling, or
adapters, is deferred until the IPC model is proven.

This also includes a future browser-facing SDK layer. A minimal
`KirieIpcBridge` may later provide a platform-neutral JavaScript entry point on
top of the native transport, but it is not part of the current IPC bring-up
scope.

## Deferred debugging and automation direction

For the current milestone, automation should prefer project-owned observability:

- explicit probe logs
- success or failure markers
- targeted scene-tree dumps when investigating lifecycle issues

This keeps the IPC bring-up dependent on interfaces that Kirie owns directly,
instead of coupling early automation to editor-facing debugger behavior.

A longer-term direction is to evaluate whether Godot's remote debugging
transport exposed through `--remote-debug` can support richer external
inspection for Kirie runs. See [References](./references.md), especially:

- Command line tutorial
- Overview of debugging tools
- Debugger panel
- EditorSettings

That work is intentionally deferred until the Android and iOS WebView IPC path
is stable.

If it becomes practical, the intended value is:

- external inspection beyond plain log scraping
- possible access to scene-tree or debugger state during automated runs
- a better foundation for future AI-assisted debugging and diagnosis

Until then, logs and project-owned debug hooks remain the primary supported
automation interfaces.

## Current Godot API direction

`kirie` is the low-level WebView and IPC bridge.

Higher-level semantics such as event routing, richer message contracts, or
request/response abstractions are expected to live above this layer, for example
in future adapters such as `eventa` or a browser-facing `KirieIpcBridge` SDK.

Current public Godot-facing names should stay close to that low-level role:

- `create_webview(options := {})`
- `destroy_webview()`
- `load_url(url)`
- `send_ipc_message(message)`

The Godot-facing `Kirie` script is expected to stay a thin wrapper over the
platform singleton, keeping naming and serialization concerns on the Godot side
without duplicating native lifecycle logic.

Current signals should also stay narrow:

- `webview_ready`
- `ipc_message_received`
- `ipc_error`

Browser lifecycle events and higher-level invocation APIs are intentionally
deferred until there is a real need for them.

For the current milestone, Kirie intentionally supports a single active WebView.
Multi-WebView support is deferred until the single-WebView bridge is working end
to end.

Kirie is also expected to support loading offline web content from Godot project
resources in the future, including content authored under `res://`.

## Packaged web resource loading

`res://` web loading is scoped to resources that are exported with the
application package itself.

For Android, Kirie should resolve `res://` web URLs against files exported into
the APK/AAB assets. For iOS, Kirie should resolve `res://` web URLs against
files exported into the app bundle. Runtime-mounted Godot packs are explicitly
out of scope for this path.

When loading `http://`, `https://`, or `file://` URLs, Kirie should keep using
the platform WebView's default loading behavior instead of intercepting or
rewriting those URLs.

An editor export hook may later help projects include a configured web root,
such as `res://web`, in the correct platform package locations. That helper is
deferred; the current plugin design should not depend on it.

## iOS packaging direction

For the current milestone, iOS should follow Godot's standard iOS plugin flow:

- the actual iOS plugin description remains a `.gdip` file
- the editor-recognized location remains `res://ios/plugins`
- Kirie should not depend on a custom editor integration to make the iOS bridge
  function

A future editor plugin may generate a thin `res://ios/plugins/kirie/Kirie.gdip`
shim from data stored under `addons/kirie` so users can keep installation and
updates centered on the addon directory. That workflow is deferred until after
the iOS bridge itself is working.
