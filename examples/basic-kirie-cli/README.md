# basic-kirie-cli

This example is the first runnable Kirie CLI-managed project.

It is intentionally small and focuses on one path:

1. Godot creates a single WebView
2. the loaded page sends `web_ready` to Godot
3. Godot replies with `godot_ready`
4. both sides log the exchanged payloads

The example supports two startup sources for the same app page:

1. a desktop Kirie dev session served by the CLI-managed Vite dev server
2. the packaged web build loaded from `res://src-web/dist/index.html`

## Layout

- `project.godot`
  the Godot project
- `src-godot`
  the Godot scene, script, and project resources
- `kirie.config.ts`
  Kirie CLI configuration for the Godot project and Vite web root
- `src-web`
  a small Vite app for WebView IPC testing

## Running desktop dev

Desktop runs use the pinned Godot CEF addon. Install it into this example before
running on macOS, Windows, or Linux:

```sh
mise run install:godot-cef examples/basic-kirie-cli
```

Start the CLI-managed Vite server and Godot project:

```sh
mise x -- corepack pnpm -F @gd-kirie/basic-kirie-cli run dev
```

The CLI passes the resolved Vite URL to Godot through `KIRIE_WEB_URL`. The
example creates a WebView with that URL when the project starts.

## Running the packaged web build

Build the web app first:

```sh
mise x -- corepack pnpm -F @gd-kirie/basic-kirie-cli run build
```

Open or run the Godot project. The example creates a WebView with
`res://src-web/dist/index.html` when the project starts and performs a minimal
round-trip:

1. the web page sends `web_ready`
2. Godot replies with `godot_ready`

## Running the Godot side manually

Recommended to use [mise](https://mise.jdx.dev/) to manage Godot versions.

Run the Godot editor with the current project:

```bash
mise x -- godot ./examples/basic-kirie-cli/project.godot
```

You can also run the game directly from the command line:

```bash
mise x -- godot --path ./examples/basic-kirie-cli
```

## Running an exported mobile app

Manual CLI runs keep export and run as separate steps. Export the Android APK:

```bash
pnpm kirie export android
```

Then install and launch that exported APK:

```bash
pnpm kirie run android
```

`kirie run android` is expected to install the default Android export output
before launching the Godot activity.

The mobile example runner builds `src-web/dist` through `kirie build` before
running the existing Godot export, install, and launch steps.

Build, install, and launch the Android example:

```bash
mise run run:example -- android basic-kirie-cli
```

Build, install, and launch the iOS simulator example:

```bash
mise run run:example -- ios basic-kirie-cli
```

This iOS example runner is currently simulator-only because it reuses the same
local Godot iOS export path used by integration testing. That is a tooling
shortcut, not a design requirement for examples. Manual example runs should
eventually allow the most useful local target, such as an iOS Simulator, a real
iOS device, or an iOS app running directly on an Apple Silicon Mac.
