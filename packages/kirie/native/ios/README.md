# iOS

This directory will host the Swift-based iOS implementation for Kirie.

Planned responsibility:

- create and manage the WKWebView
- expose the Godot iOS plugin entry points
- bridge messages between Godot and web content

Current packaging direction:

- use Godot's standard iOS plugin flow with a `.gdip` file
- keep the current milestone compatible with `res://ios/plugins`
- defer any editor-generated `gdip` shim workflow until after the iOS IPC path
  is working
