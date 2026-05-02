# Architecture Notes

Current repository scope is intentionally constrained.

We are standardizing only the minimum plugin shape needed to support:

- a Godot-facing Kirie service
- a scene-friendly KirieView node
- a thin C# KirieClient wrapper for .NET projects
- Android and iOS native WebView implementations
- packaged `res://` web resource loading for exported apps
- a repo-level platform integration test project

Anything beyond that, such as CLI tooling, app-level event adapters, or
invocation APIs, is deferred until the IPC model is proven. The current
`@gd-kirie/ipc` package is intentionally only a browser-side transport wrapper on
top of the raw native bridge.

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
in future app-specific adapters above Kirie or `@gd-kirie/ipc`.

Current public Godot-facing names should stay close to that low-level role:

- `create_webview(options := {})`
- `destroy_webview()`
- `load_url(url)`
- `load_html_string(html, base_url := "")`
- `send_ipc_message(message)`
- `get_launch_option(key)`

The Godot-facing `Kirie` script is expected to stay a thin wrapper over the
platform singleton, keeping naming and serialization concerns on the Godot side
without duplicating native lifecycle logic.

The C# `KirieClient` wrapper follows the same low-level surface and forwards to
the same platform singleton. Its public API should feel idiomatic to .NET users:
methods use C# naming, and Kirie signals are exposed as C# events. Internal
Godot `Callable` usage exists only to connect native singleton signals and iOS
callbacks.

Current signals should also stay narrow:

- `webview_ready`
- `ipc_message_received`
- `ipc_error`

Browser lifecycle events and higher-level invocation APIs are intentionally
deferred until there is a real need for them.

For the current milestone, Kirie intentionally supports a single active WebView.
Multi-WebView support is deferred until the single-WebView bridge is working end
to end.

Kirie supports loading packaged offline web content from Godot project resources
through the `res://web` path described below.

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

The addon export plugin currently includes `res://web` in the iOS app bundle.
Android example exports still rely on the project export preset include filters
for packaged web files.

## iOS packaging direction

For the current milestone, iOS should follow the same addon-centered shape as
Android:

- users consume `addons/kirie`
- produced addon trees include `addons/kirie/ios/Kirie.xcframework`
- the addon export plugin injects the xcframework, system frameworks, plist
  content, and native initialization glue through Apple export hooks
- example projects should not carry a separate `res://ios/plugins` shim
