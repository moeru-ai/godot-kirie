# @gd-kirie/ipc

Thin browser-side IPC transport for Kirie WebView pages.

The package is imported by web content running inside a Kirie WebView. Native platforms continue to provide the low
level bridge on `globalThis`, and this package only wraps that bridge with a small typed module API.

## API

```ts
import { onTextReceived, sendText } from "@gd-kirie/ipc";

sendText(JSON.stringify({
  type: "web_ready",
}));

const unsubscribe = onTextReceived((message) => {
  console.log(message);
});

unsubscribe();
```

The package selects the native transport from `window.kirie.platform`, which is
injected by Kirie before page scripts run.

Android exposes three channels backed by CBOR packets and AndroidX WebKit
ArrayBuffer messages. iOS exposes the same lane API over WKWebView script
messages, carrying each CBOR packet as base64 inside the platform string
message:

- `sendText()` / `onTextReceived()` for CBOR text strings
- `sendBinary()` / `onBinaryReceived()` for CBOR byte strings
- `sendData()` / `onDataReceived()` for CBOR-encoded structured data through `cborg`

The structured data subset is limited to `null`, booleans, numbers, strings,
arrays, and objects with string keys. JSON message shapes are a caller or
adapter convention and should be sent with `sendText()` when needed.

## Pointer input forwarding

Kirie can opt in to forwarding browser pointer events back through Godot's
input pipeline. Enable it on the Godot owner and import the automatic browser
listener:

```gdscript
$KirieNode.pointer_input_forwarding_enabled = true
```

```ts
import "@gd-kirie/ipc/pointer-input/auto";
```

For explicit composition, `@gd-kirie/ipc/pointer-input` exports
`phaseFromPointerEvent`, `sendPointerEvent`, and
`createPointerEventsHandler` together with their pointer input types. The
automatic entry uses the same functions and only adds document listener
registration.

The listener uses the normal DOM bubbling phase. A web-owned interactive region
can keep its pointer sequence in the WebView with `event.stopPropagation()`;
the `pointerdown` event decides whether the complete sequence is converted into
synthetic Godot input events.

Forwarding is disabled by default. It replays pointer input into Godot; it does
not make the native WebView itself hit-test transparent. The implementation uses
Godot's
[`Input.parse_input_event()`](https://docs.godotengine.org/en/stable/classes/class_input.html#class-input-method-parse-input-event)
API; forwarded mouse and touch events retain their destination
[`window_id`](https://docs.godotengine.org/en/stable/classes/class_inputeventfromwindow.html#class-inputeventfromwindow-property-window-id).
