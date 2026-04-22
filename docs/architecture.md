# Architecture Notes

Current repository scope is intentionally constrained.

We are standardizing only the minimum plugin shape needed to support:

- a Godot-facing Kirie service
- a scene-friendly KirieView node
- Android and iOS native WebView implementations
- an example project used for integration testing

Anything beyond that, such as dedicated protocol packages, CLI tooling, or
adapters, is deferred until the IPC model is proven.

## Current Godot API direction

`kirie` is the low-level WebView and IPC bridge.

Higher-level semantics such as event routing, richer message contracts, or
request/response abstractions are expected to live above this layer, for example
in future adapters such as `eventa`.

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
