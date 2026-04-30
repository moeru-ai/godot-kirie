# @gd-kirie/kirie

This package contains the Kirie plugin sources and platform-specific native
implementations.

Current layout:

- `addon/addons/kirie`: Godot-facing plugin files
- `native/android`: Android implementation
- `native/ios`: iOS implementation

The goal of this package is to stay small until the WebView IPC surface is proven
in a real example project.

