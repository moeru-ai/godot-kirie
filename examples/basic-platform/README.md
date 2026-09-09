# basic-platform

A compact desktop example for `@gd-kirie/platform` and `GdKirie.Platform`. It visualizes
display, window, and pointer coordinates and exercises host-window controls, pointer passthrough, and global shortcuts.

The Esc global-shortcut backend is available on macOS and Windows. On Linux,
registration fails visibly and pointer passthrough is left disabled.

Run these setup commands from the repository root:

```sh
mise x -- pnpm install
mise run build:packages
mise x -- pnpm -C examples/basic-platform exec kirie doctor --fix godot-cef
mise x -- pnpm -C examples/basic-platform exec kirie build dotnet
```

Start the Kirie-managed Vite server and Godot project together:

```sh
mise x -- pnpm -C examples/basic-platform run dev
```

To run the packaged web build, build it through Kirie before starting Godot:

```sh
mise x -- pnpm -C examples/basic-platform run build
mise x -- godot --path examples/basic-platform
```
