# basic-platform

A compact desktop example for `@gd-kirie/platform` and `GdKirie.Platform`. It
visualizes display, window, and pointer coordinates. It also exercises window
controls, pointer passthrough, global shortcuts, external URLs, the application
data directory, and desktop notifications.

The Esc global-shortcut backend is available on macOS and Windows. On Linux,
registration fails visibly and pointer passthrough is left disabled.
Desktop notifications are available on macOS 10.14 or later. The example shows
the notification ID after the user clicks the notification.

macOS grants notification permission to the running application bundle. A
project started through the Godot editor uses the Godot host identity. Export
the example with its own bundle identifier, then copy it to `/Applications` or
`~/Applications` before the first launch. Apps launched from temporary
directories can be rejected with `UNErrorDomain 1` before macOS registers their
notification permission. Use the installed copy to test the product permission,
banner, and click activation.

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
