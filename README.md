# godot-kirie

Kirie is an experimental Godot application framework built around an embeddable
low-level Godot WebView plugin and IPC core.

## Installation

Download `kirie-addon.zip` from a GitHub Release asset and extract it into the
root of your Godot project. The final layout should be:

```text
res://addons/kirie/
```

If your project already has an `addons` directory, merge the extracted `addons`
directory into the project root. Do not extract the zip inside the existing
`addons` directory.

After copying the files, enable Kirie from Godot's Project Settings Plugins tab.
This follows Godot's plugin installation flow. Release packaging details live in
[docs/addon-release.md](docs/addon-release.md).

## Export Options

Kirie adds Godot export preset options under `kirie/debug`:

- `enable_web_inspector`: enable platform WebView inspection for exported apps.
- `allow_tls_bypass`: allow invalid TLS certificates for exported apps. On iOS,
  enabling this also relaxes App Transport Security (ATS) by allowing arbitrary
  loads, which can permit insecure cleartext HTTP requests in addition to bypassing
  invalid TLS certificates.

Both options default to disabled and are intended for development exports only.
In particular, `allow_tls_bypass` reduces transport security and must not be
enabled for production builds.

## Current Architecture

```mermaid
flowchart LR
    A["Godot Project"] --> B["addons/kirie"]
    B --> C["Kirie / KirieView / KirieClient"]
    C --> D["Android native implementation"]
    C --> E["iOS native implementation"]
    D <--> F["WebView"]
    E <--> F
    F <--> G["Web app / page"]
```

The repository is still deliberately small, but it now has distinct package,
example, and regression-test areas:

- `packages/kirie`: the Godot addon, C# wrapper, and Android and iOS native
  plugin code
- `packages/ipc`: a thin browser-side transport wrapper for Kirie WebView pages
- `packages/ipc-eventa`: browser-side Eventa adapter over Kirie text IPC
- `packages/GdKirie.EventaAdapter`: .NET 10 Eventa adapter over Kirie text IPC
- `examples/basic-ipc`: beginner-friendly demo project for the raw IPC flow
- `examples/basic-kirie-cli`: beginner-friendly demo project for the Kirie CLI workflow
- `examples/eventa-csharp`: beginner-friendly demo project for Godot C# Eventa adapter usage
- `tests/integration`: exported-app platform integration tests
- `scripts/build.ts`: mise task entrypoint re-exports
- `scripts/build-kirie.ts`: Kirie addon artifact and packaging tasks
- `scripts/build-integration.ts`: platform integration export tasks
- `scripts/build-examples.ts`: example build, install, and launch tasks
- `scripts/build-shared.ts`: build primitives shared by multiple task domains
- `scripts/integration-runner.ts`: platform integration test launchers
- `docs`: project notes and design decisions
  - `docs/dreams`: exploratory notes for ideas outside the current milestone

Primary references live in [docs/references.md](docs/references.md).

The low-level plugin and IPC milestone covers:

1. Create a WebView on mobile and desktop platforms.
2. Establish bidirectional IPC between Godot and the WebView.
3. Support packaged `res://` web content loading for bridge tests.
4. Add desktop Godot CEF compatibility, starting with macOS.
5. Stabilize the Kirie plugin shape used by higher-level framework tooling.

The plugin and IPC layers are intended to stay low-level WebView and IPC
surfaces. A small `@gd-kirie/ipc` browser package exists as a convenience
transport wrapper. Eventa adapters live above that bridge:
`@gd-kirie/ipc-eventa` for browser pages, and `GdKirie.EventaAdapter` for
.NET 10 C# projects. The C# surface is a thin `KirieClient` wrapper over the
same platform singleton used by GDScript, with C# events for the current Kirie
signals.

The mobile IPC experiment uses explicit text, binary, and data lanes over CBOR
packets. The browser package encodes and decodes those packets with `cborg`.
Android native code uses Jackson CBOR and converts structured data through
Jackson's tree model before emitting Godot-compatible values. iOS native code
uses SwiftCBOR and carries CBOR packets as base64 strings through WKWebView
script messages. JSON and Eventa envelopes remain caller or adapter choices
carried over the text lane, not Kirie core payload types.

Desktop compatibility starts with Godot CEF as Kirie's desktop WebView backend,
with macOS as the first target. Scope and runtime-injection details live in
[docs/architecture.md](docs/architecture.md).

`GdKirie.EventaAdapter` intentionally targets `net10.0` because the upstream
Eventa .NET package targets `net10.0`, and .NET 8 LTS reaches end of support on
2026-11-10. Godot C# projects targeting `net8.0` or `net9.0` should expect
restore or build failures when referencing the adapter.
