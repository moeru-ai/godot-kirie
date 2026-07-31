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

> [!IMPORTANT]
> Kirie WebViews normally fill their native host above Godot. CSS transparency
> does not pass native hit tests through to Godot, so visible Godot controls
> behind the WebView cannot be clicked without pointer forwarding. Most Kirie
> pages should import `@gd-kirie/ipc/pointer-input/auto`.

Enable both sides; the browser entry registers on import:

```gdscript
$KirieNode.pointer_input_forwarding_enabled = true
```

```ts
import "@gd-kirie/ipc/pointer-input/auto";
```

### Custom event orchestration

For custom targets or lifetimes, use the explicit entry instead:

```ts
import {
  createPointerEventsHandler,
  phaseFromPointerEvent,
  sendPointerEvent,
} from "@gd-kirie/ipc/pointer-input";
```

`createPointerEventsHandler()` returns `capture`, `bubble`, and `cancel` handlers;
the caller owns their registration and removal.

`pointerdown` bubbling decides ownership: `event.stopPropagation()` keeps the
sequence in the WebView; otherwise its move, up, and cancel events are forwarded
to Godot.

Forwarding uses Godot's
[`Input.parse_input_event()`](https://docs.godotengine.org/en/stable/classes/class_input.html#class-input-method-parse-input-event)
API; forwarded mouse and touch events retain their destination
[`window_id`](https://docs.godotengine.org/en/stable/classes/class_inputeventfromwindow.html#class-inputeventfromwindow-property-window-id).
