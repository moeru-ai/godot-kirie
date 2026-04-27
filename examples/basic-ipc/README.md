# basic-ipc

This example is the first runnable Kirie integration target.

It is intentionally small and focuses on one path:

1. Godot creates a single WebView
2. the loaded page sends `web_ready` to Godot
3. Godot replies with `godot_ready`
4. both sides log the exchanged payloads

The example now supports two ways to exercise that path:

1. a manual remote page served by the Vite dev server
2. the local probe page loaded from the built `res://web/dist/index.html`

## Layout

- `project.godot`
  the Godot project
- `main.tscn`
  the main test scene
- `scripts/main.gd`
  the scene logic
- `web`
  a small Vite app for WebView IPC testing

## Running the web side

Run the Vite dev server and use that URL in the project UI.

Example:

```sh
pnpm --filter @kirie/basic-ipc-web run dev
```

Then open the Godot project and use:

`http://10.0.2.2:5173/`

for an Android emulator, or an appropriate LAN/local address for a device.

## Running the inline probe

Build the web app first:

```sh
pnpm --filter @kirie/basic-ipc-web run build
```

Open the Godot project and press `Run Probe`.

This creates a WebView if needed, loads
`res://web/dist/index.html?mode=probe`, and performs a minimal round-trip:

1. probe sends `web_ready`
2. Godot replies with `godot_ready`
3. probe replies with `web_ack`

## Running the Godot side

Recommended to use [mise](https://mise.jdx.dev/) to manage Godot versions.

Run the Godot editor with the current project:

```bash
mise x -- godot ./examples/basic-ipc/project.godot
```

You can also run the game directly from the command line:

```bash
mise x -- godot --path ./examples/basic-ipc
```
