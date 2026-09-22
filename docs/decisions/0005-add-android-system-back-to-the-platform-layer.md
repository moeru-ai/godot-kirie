---
status: "proposed"
date: 2026-09-22
decision-makers: "LemonNeko"
consulted: "Doji"
informed: "Kirie contributors"
---

# Add Android system Back to the Platform layer

## Context

Android delivers the system Back button to the Godot host, not to the WebView.
A page cannot receive it through a web API, and only the page knows whether Back
should change the route or close the application.

Godot already surfaces the request. The bound `Window` emits
`go_back_requested` right after `Node.NOTIFICATION_WM_GO_BACK_REQUEST`. By
default, `SceneTree.quit_on_go_back` also makes the engine quit, so the page
never gets a chance to handle the request. Applications that handle Back
already disable that setting manually.

## Decision

Add `back.onRequested()` to the Platform layer. `GdKiriePlatformHost` connects
to the bound window's `Window.GoBackRequested` signal and re-emits each request
as the `kirie:platform:back:requested` event. The application subscribes in the
browser and decides what Back means.

The Platform host does not change `SceneTree.quit_on_go_back`. An application
that handles Back sets it to `false`; otherwise Godot quits before or while the
event is delivered. The event is emitted only where the platform supplies a
system Back request.

## Consequences

- Product routing stays outside the native host.
- The application owns the "navigate or quit" decision and the Godot
  `quit_on_go_back` setting.
- The capability uses Godot's existing signal, so no Kotlin, AAR, or export
  configuration changes are required.
- iOS and the desktop platforms have no system Back button, so the event does
  not fire there.

## Sources

- [Godot `Window.go_back_requested`](https://docs.godotengine.org/en/4.7/classes/class_window.html#class-window-signal-go-back-requested)
- [Godot `SceneTree.quit_on_go_back`](https://docs.godotengine.org/en/4.7/classes/class_scenetree.html#class-scenetree-property-quit-on-go-back)
- [Godot `Node.NOTIFICATION_WM_GO_BACK_REQUEST`](https://docs.godotengine.org/en/4.7/classes/class_node.html#class-node-constant-notification-wm-go-back-request)
