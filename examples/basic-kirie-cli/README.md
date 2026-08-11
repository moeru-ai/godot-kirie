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
  the Godot scene, TypeScript-authored controller, generated GDScript, and
  project resources
- `tstogd.json` and `tsconfig.json`
  the isolated TypeScript-to-GDScript configuration
- `kirie.config.ts`
  Kirie CLI configuration for the Godot project and Vite web root
- `src-web`
  a small Vite app for WebView IPC testing

## TypeScript-authored GDScript

The scene controller follows tstogd's
[manual project setup](https://github.com/nnn3d/typescript-to-gdscript/blob/v0.1.2/docs/configuration.md).
The experiment is intentionally limited to `src-godot/scripts/main.ts`. Kirie
addon and scene typings are disabled because tstogd 0.1.2 cannot generate valid
TypeScript for the current Kirie addon or the hyphenated `src-godot` scene path.
The source declares only the small Kirie API surface it uses; Kirie's native
GDScript remains unchanged.

## Running desktop dev

Desktop runs use the pinned Godot CEF addon. Install it into this example before
running on macOS, Windows, or Linux:

```sh
mise x -- corepack pnpm -C examples/basic-kirie-cli exec kirie doctor --fix godot-cef
```

Start the CLI-managed Vite server and Godot project:

```sh
mise x -- corepack pnpm -F @gd-kirie/basic-kirie-cli run dev
```

The CLI passes the resolved Vite URL to Godot through the `kirie-web-url` launch
option. The package script first regenerates
`src-godot/generated/main.gd` from `src-godot/scripts/main.ts`, then creates a
WebView with that URL when the project starts.

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

After changing the TypeScript controller, regenerate the scene-attached
GDScript:

```bash
mise x -- corepack pnpm -F @gd-kirie/basic-kirie-cli run build:godot
```

`src-godot/generated/` is ignored. Run the generator before opening the Godot
project directly, and edit `src-godot/scripts/main.ts` instead of generated
GDScript.

Run the Godot editor with the current project:

```bash
mise x -- godot ./examples/basic-kirie-cli/project.godot
```

You can also run the game directly from the command line:

```bash
mise x -- godot --path ./examples/basic-kirie-cli
```

## Running an exported mobile app

Run `pnpm run build:godot` after editing `main.ts` before using the direct
`pnpm kirie` commands below. The repository's `mise run run:example` workflow
regenerates the GDScript automatically.

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

Development runs can also use the CLI-managed Vite server on mobile:

```bash
pnpm kirie dev android --device <selector>
pnpm kirie dev ios --device <simulator>
```

Android development runs set up `adb reverse` for the Vite dev server port and
pass a `127.0.0.1` `kirie-web-url` to the launched app. The mobile example
keeps the Android export preset's `permissions/internet` option enabled because
the WebView still opens a network socket for that loopback HTTP URL. The mobile
example runner builds `src-web/dist` through `kirie build` before running the
existing Godot export, install, and launch steps.

Build, install, and launch the Android example:

```bash
mise run run:example -- android basic-kirie-cli
```

Build, install, and launch the iOS simulator example:

```bash
mise run run:example -- ios basic-kirie-cli
```

Build, sign, install, and launch the iOS example on a connected physical
device. Xcode uses the Apple Development identity and provisioning profile
managed by the local Xcode account:

```bash
mise run run:example -- ios basic-kirie-cli <device-udid>
```

The CLI uses `xcodebuild` for the device app and Apple's `devicectl` for
installation and launch. The same unified device selector is available for
development runs:

```bash
pnpm kirie dev ios --project examples/basic-kirie-cli --device <device-udid>
```

The public export command also produces an installable `.app`. It defaults to
an arm64 simulator build:

```bash
pnpm kirie export ios --project examples/basic-kirie-cli
```

Pass a physical-device UDID to build a signed device app. Xcode obtains the
signing identity and provisioning profile from the local Xcode account:

```bash
pnpm kirie export ios \
  --project examples/basic-kirie-cli \
  --device <device-udid> \
  --output dist/kirie/ios/device-debug.app
pnpm kirie run ios \
  --project examples/basic-kirie-cli \
  --device <device-udid> \
  --app dist/kirie/ios/device-debug.app
```
