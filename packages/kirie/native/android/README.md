# Android

This directory hosts the Kotlin-based Android implementation for Kirie.

Current direction:

- based on the standard Godot Android v2 plugin template
- structured as an Android library root with a `plugin` module
- depends on the Godot Android library matching the repo's target Godot version

Current responsibility:

- create and manage the Android WebView
- expose a Godot Android plugin singleton
- bridge low-level IPC messages between Godot and web content

Notes:

- The current skeleton was adapted from the official Godot Android v2 plugin
  template at commit `089491f`.
- Demo packaging from the upstream template was intentionally removed because
  this repository keeps Godot-facing addon files under
  `packages/kirie/addon/addons/kirie/`.
