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

Current signals should also stay narrow:

- `webview_ready`
- `ipc_message_received`
- `ipc_error`

Browser lifecycle events and higher-level invocation APIs are intentionally
deferred until there is a real need for them.

For the current milestone, Kirie intentionally supports a single active WebView.
Multi-WebView support is deferred until the single-WebView bridge is working end
to end.
