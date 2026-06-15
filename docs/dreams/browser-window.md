# Kirie BrowserWindow

BrowserWindow is a future high-level application API idea. It is not part of
the current Kirie CLI or plugin milestone.

## Direction

Kirie's low-level primitive remains `KirieNode`: a scene-friendly owner for a
platform WebView and IPC lanes.

A future BrowserWindow layer would sit above that primitive:

```text
BrowserWindow = Godot Window + KirieNode + web entry resolver
```

The intended mental model is close to Electron's host-side window API, but the
implementation should stay native to Godot's scene and window model. Godot's
`Window` node owns window behavior, while `KirieNode` owns WebView creation and
IPC.

## API boundary

Do not add BrowserWindow as a GDScript API. GDScript remains the low-level
plugin substrate with `GdKirie` and `KirieNode`.

Future high-level window APIs should target:

- C# host-side APIs for creating and controlling windows.
- TypeScript web-side APIs for renderer/window cooperation.

This keeps the framework API in languages with package and module boundaries
instead of expanding the addon GDScript surface.

## Dependencies

BrowserWindow should wait until the Kirie app layout and web entry resolver are
stable. The planned CLI/app layout gives future window APIs a single way to
resolve development and production entries:

```text
development: KIRIE_WEB_URL from `kirie dev`
production: res://src-web/dist/index.html and sibling route entries
```

Until that resolver exists, users can manually compose Godot `Window` nodes and
`KirieNode` instances in their own projects.

## Out of scope

Keep BrowserWindow separate from the current CLI work. Do not combine it
with:

- `kirie dev`
- the `src-godot` / `src-web` example migration
- export plugin web-root migration
- platform integration tests

It is also not a reason to expose the full Godot CEF browser-control API through
Kirie core.
