# Kirie iOS Plugin

This directory contains the native iOS implementation for `Kirie`, the first-pass transparent web UI layer for the Godot project.

## What this version does

- Exposes `init_kirie` and `deinit_kirie` entry points for the Godot iOS plugin system.
- Registers the `Kirie` Godot singleton.
- Creates a transparent full-screen `WKWebView` through `createWebView`.
- Bridges text, binary, and data IPC lanes with CBOR packets carried through
  `window.webkit.messageHandlers.kirie.postMessage(...)` and `kirie:ipc-packet`
  DOM events.
- Resolves `res://` web URLs to files exported into the app bundle and serves
  them through Kirie's `WKURLSchemeHandler`.

`res://` loading is intentionally limited to packaged application bundle
resources. For example, `res://web/index.html` resolves to Kirie's resource
origin and serves `web/index.html` from the app bundle. `res://web` resolves to
`web/index.html`. Runtime-mounted Godot packs are not part of this path.
`http://`, `https://`, and `file://` URLs keep the default `WKWebView` loading
behavior.

## Tooling

- `xcodebuild`
- `xcodegen`
- Apple toolchain from the installed Xcode

The project definition lives in [project.yml](./project.yml). The generated `.xcodeproj` is intentionally not committed.

## Build

Run the repository-level task:

```sh
mise x -- corepack pnpm run build:ios-xcframework
```

The task will:

1. Generate a local Xcode project under `.generated/`
2. Archive `Kirie` for `iphoneos` and `iphonesimulator`
3. Create `Kirie.xcframework`
4. Stage the result under `packages/kirie/addon/addons/kirie/ios/`

## Runtime configuration

Export-time plist keys are injected by the addon export plugin. WebView debug
capabilities, such as inspectability and invalid TLS certificate bypass, are
controlled by Godot export preset options instead of being tied to the native
framework build configuration.

## Notes

- The WebView is visually transparent, but it still captures touches everywhere it covers.
- ATS widening is injected only when the TLS bypass export option is enabled.
- Invalid TLS certificates are bypassed only when the TLS bypass export option is enabled.

## Current packaging direction

- keep iOS native artifacts inside staged `addons/kirie` trees
- inject iOS native pieces through the addon export plugin
- do not depend on `res://ios/plugins` or `.gdip` shims
