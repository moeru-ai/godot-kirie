# basic-platform

A compact desktop example for `@gd-kirie/platform` and `GdKirie.Platform`. It
visualizes display, window, and pointer coordinates. It also exercises window
controls, pointer passthrough, global shortcuts, external URLs, the application
data directory, desktop notifications, and Android system Back requests.

The Esc global-shortcut backend is available on macOS and Windows. On Linux,
registration fails visibly and pointer passthrough is left disabled.
Desktop notifications are available on macOS 11 or later. The example shows
the notification ID after the user clicks the notification.
Android forwards the system Back button to the exported `backRequested` event.
On Android, set `SceneTree.quit_on_go_back` to `false` to handle Back in the page.

To test macOS notifications under the example's identity, export it and copy
the app to `/Applications` or `~/Applications` before its first launch. A run
from the editor uses Godot's identity; a temporary app path can fail with
`UNErrorDomain 1`.

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
