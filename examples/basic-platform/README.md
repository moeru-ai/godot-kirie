# basic-platform

A compact desktop example for `@gd-kirie/platform` and `GdKirie.Platform`. It visualizes
display, window, and pointer coordinates and exercises host-window controls, pointer passthrough, and global shortcuts.

The Esc global-shortcut backend is available on macOS and Windows. On Linux,
registration fails visibly and pointer passthrough is left disabled.

Install workspace dependencies and the pinned Godot CEF addon:

```sh
mise x -- corepack pnpm install
mise run install:godot-cef examples/basic-platform
```

## Development

Use the repository-local Kirie CLI to start Vite and Godot together:

```sh
mise x -- corepack pnpm exec kirie dev --project examples/basic-platform
```

The CLI passes Vite's resolved URL to Godot through the `kirie-web-url` launch
option. The example uses that URL whenever the option is present; it does not
require `kirie-dev` or a debug build.

## Packaged web build

Without `kirie-web-url`, the example loads the packaged production page from
`res://src-web/dist/index.html`. Build that page before running Godot directly:

```sh
mise x -- corepack pnpm -F @gd-kirie/basic-platform-web run build
mise x -- godot --path examples/basic-platform
```
