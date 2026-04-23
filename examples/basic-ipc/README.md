# basic-ipc

This example is the first runnable Kirie integration target.

It is intentionally small and focuses on one path:

1. Godot creates a single WebView
2. the loaded page sends `web_ready` to Godot
3. Godot replies with `godot_ready`
4. both sides log the exchanged payloads

The example now supports two ways to exercise that path:

1. a manual remote page loaded from `web/index.html`
2. a minimal inline probe loaded through `load_html_string()`

## Layout

- `project.godot`
  the Godot project
- `main.tscn`
  the main test scene
- `scripts/main.gd`
  the scene logic
- `web/index.html`
  a tiny page for WebView IPC testing

## Running the web side

Serve the `web/` directory with any simple static server and use that URL in the
project UI.

Example:

```sh
cd examples/basic-ipc/web
python3 -m http.server 8000
```

Then open the Godot project and use:

`http://10.0.2.2:8000/`

for an Android emulator, or an appropriate LAN/local address for a device.

## Running the inline probe

Open the Godot project and press `Run Probe`.

This creates a WebView if needed, loads a tiny inline HTML page through
`load_html_string()`, and performs a minimal round-trip:

1. probe sends `web_ready`
2. Godot replies with `godot_ready`
3. probe replies with `web_ack`

## Running the Godot side

Recommended to use [GodotEnv](https://github.com/chickensoft-games/GodotEnv) to manage Godot versions.

You can use the command below to set current Godot version for this project:

```bash
godotenv godot use 4.6.2
```

Then run the Godot editor with the current project:

```bash
"$(godotenv godot env path)" ./examples/basic-ipc/project.godot
```

You can also run the game directly from the command line:

```bash
"$(godotenv godot env path)" --path ./examples/basic-ipc
```
