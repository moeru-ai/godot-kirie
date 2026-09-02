# basic-platform

A compact desktop example for `@gd-kirie/platform` and `GdKirie.Platform`. It visualizes
display, window, and pointer coordinates and exercises host-window controls, pointer passthrough, and global shortcuts.

The Esc global-shortcut backend is available on macOS and Windows. On Linux,
registration fails visibly and pointer passthrough is left disabled.

Install the workspace dependencies and the desktop Godot CEF addon:

```sh
mise x -- corepack pnpm install
mise x -- corepack pnpm -C examples/basic-platform exec kirie doctor --fix godot-cef
```

Start the Kirie-managed Vite server and Godot project together:

```sh
mise x -- corepack pnpm -C examples/basic-platform run dev
```

To run the packaged web build, build it through Kirie before starting Godot:

```sh
mise x -- corepack pnpm -C examples/basic-platform run build
mise x -- godot --path examples/basic-platform
```
