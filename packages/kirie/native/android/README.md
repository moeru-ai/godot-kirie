# Android

This directory hosts the Kotlin-based Android implementation for Kirie.

Current direction:

- based on the standard Godot Android v2 plugin template
- structured as an Android library root with a `plugin` module
- depends on the Godot Android library matching the repo's target Godot version
- ships to Godot projects as a local addon AAR through `EditorExportPlugin`
  until Kirie needs Maven-delivered Android runtime dependencies

Current responsibility:

- create and manage the Android WebView
- expose a Godot Android plugin singleton
- bridge low-level IPC messages between Godot and web content
- resolve `res://` web URLs to files exported into the APK/AAB assets

`res://` loading is intentionally limited to packaged application assets. The
Android implementation rewrites `res://web/index.html` to Kirie's local asset
origin and serves `web/index.html` from the APK/AAB assets through the WebView
request handler. `res://web` resolves to `web/index.html`. Runtime-mounted Godot
packs are not part of this path. `http://`, `https://`, and `file://` URLs keep
the default Android WebView loading behavior.

Notes:

- The current skeleton was adapted from the official Godot Android v2 plugin
  template at commit `089491f`.
- Local AAR export follows Godot's Android plugin v2 and `EditorExportPlugin`
  hooks; see `docs/references.md` for the official Godot references.
- Demo packaging from the upstream template was intentionally removed because
  this repository keeps Godot-facing addon files under
  `packages/kirie/addon/addons/kirie/`.
