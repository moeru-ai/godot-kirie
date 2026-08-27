# basic-platform

A compact desktop example for `@gd-kirie/platform` and `GdKirie.Platform`. It visualizes
display, window, and pointer coordinates and exercises host-window controls, pointer passthrough, and global shortcuts.

The Esc global-shortcut backend is currently available on macOS. On Windows or
Linux, registration fails visibly and pointer passthrough is left disabled.

```sh
mise x -- corepack pnpm install
mise x -- corepack pnpm -F @gd-kirie/basic-platform-web run build
mise run install:godot-cef examples/basic-platform
mise x -- godot --path examples/basic-platform
```
