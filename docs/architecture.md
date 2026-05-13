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

The current IPC milestone keeps Kirie core byte-oriented and CBOR-based while
preserving separate text, binary, and data lanes. Higher-level protocols,
including the planned Eventa adapter, remain above Kirie.

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
- `send_text(message)`
- `send_binary(bytes)`
- `send_data(value)`
- `send_text_packet(bytes)`
- `send_binary_packet(bytes)`
- `send_data_packet(bytes)`
- `get_launch_option(key)`

The packet methods are the `GdKirie` native core contract: each lane carries an
already encoded CBOR packet as bytes. `KirieView` is the scene-friendly wrapper
and intentionally exposes only typed lane helpers. The non-packet methods are
the temporary GDScript codec/proving layer that encodes text strings, byte
arrays, and the constrained data subset before forwarding packets to native.
This keeps the native bridge raw while the packet format and platform behavior
are still being proven. A future native codec can replace or sit beside the
GDScript codec once the lane contract is stable.

The Godot-facing `Kirie` script is expected to stay a thin wrapper over the
platform singleton, keeping naming and serialization concerns on the Godot side
without duplicating native lifecycle logic.

The C# `KirieClient` wrapper follows the same lane surface and forwards to the
same platform singleton. Its public API should feel idiomatic to .NET users:
methods use C# naming, Kirie signals are exposed as C# events, and typed helpers
sit next to the raw packet methods for low-level tests. Internal Godot
`Callable` usage exists only to connect native singleton signals and iOS
callbacks.

Current signals should also stay narrow:

- `webview_ready`
- `text_received`
- `binary_received`
- `data_received`
- `text_packet_received`
- `binary_packet_received`
- `data_packet_received`
- `ipc_error`

Browser lifecycle events and higher-level invocation APIs are intentionally
deferred until there is a real need for them.

For the current milestone, Kirie intentionally supports a single active WebView.
Multi-WebView support is deferred until the single-WebView bridge is working end
to end.

Kirie supports loading packaged offline web content from Godot project resources
through the `res://web` path described below.

## Runtime debug configuration

Debug behavior that affects exported applications is controlled by Godot export
preset options, not by automatically detecting whether the export itself is a
debug build.

The current export preset options are:

- `kirie/debug/enable_web_inspector`
- `kirie/debug/allow_tls_bypass`

On Android, the export plugin writes these values as application manifest
metadata for the native plugin to read at runtime. On iOS, it writes matching
Info.plist values. The iOS ATS widening plist block is injected only when
`kirie/debug/allow_tls_bypass` is enabled.

Android native artifact selection is separate from application debug behavior.
Exports use `Kirie-release.aar` by default. Repository-local Android native
debugging can opt into `Kirie-debug.aar` for a single export by passing
`-- --kirie-android-aar=debug` to the Godot export command.

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

## GitHub Release addon flow

GitHub Release addon publishing is configured through the `Addon Release`
workflow. Keep it separate from the npm publishing flow, which is only for
browser-side workspace packages such as `@gd-kirie/ipc`.

The release artifact shape and workflow modes live in
[Addon Release](./addon-release.md).

The planned .NET Eventa adapter will introduce a separate NuGet release lane.
Keep it separate from addon zip publishing and npm publishing.

## IPC and adapter split

Kirie IPC uses explicit `text`, `binary`, and `data` lanes over byte-oriented
CBOR packets. Text payloads are CBOR text strings, binary payloads are CBOR byte
strings, and data payloads are a constrained cross-platform data subset: null,
booleans, finite numbers, strings, arrays, and maps with string keys. Integer
values are limited to the JavaScript safe integer range so all current Kirie
frontends agree on the value. Byte arrays belong to the binary lane. Godot
objects, nodes, callables, RIDs, and other engine-local values are out of scope
for the data lane.

Current data encoders write floating-point values as CBOR float64. Decoders
accept CBOR float16, float32, and float64 so Kirie can read valid CBOR produced
by other encoders, but non-finite values are still rejected after decode. Nested
arrays and maps have a fixed depth limit to avoid recursive payloads exhausting
the host runtime.

The staged architecture is:

- Native core: exposes raw packet send methods and raw packet received signals
  for the three lanes.
- GDScript proving layer: temporarily owns CBOR encode/decode helpers and
  typed lane methods/signals such as `send_text(...)` and `data_received`.
- Future native codec option: may move encode/decode closer to platform code
  once the packet contract has enough validation across Android, iOS, GDScript,
  C#, and browser callers.

Godot CEF is a learning reference and future compatibility target because it
separates `ipc_message`, `ipc_binary_message`, and `ipc_data_message`, with its
data lane documented as CBOR-backed.

Eventa remains above Kirie. The first Eventa adapter should support event
emission and unary request/response RPC only. Its JSON envelope is an adapter
encoding over Kirie text IPC, not a Kirie core payload type. Treat
`moeru-ai/eventa` and `moeru-ai/eventa.net` as the upstream Eventa projects; do
not change those projects unless the adapter exposes a real design issue. The
.NET adapter is planned as `GdKirie.EventaAdapter`, with a root `GdKirie.slnx`,
a package under `packages/GdKirie.EventaAdapter`, and a NuGet-provided source
bridge for connecting to addon-shipped `KirieClient.cs` without putting Eventa
files in `addons/kirie`.
