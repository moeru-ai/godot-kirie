# @gd-kirie/ipc

Thin browser-side IPC transport for Kirie WebView pages.

The package is imported by web content running inside a Kirie WebView. Native platforms continue to provide the low
level bridge on `globalThis`, and this package only wraps that bridge with a small typed module API.

## API

```ts
import { onIpcMessageReceived, sendIpcMessage } from "@gd-kirie/ipc";

sendIpcMessage({
  type: "web_ready",
});

const unsubscribe = onIpcMessageReceived((message) => {
  console.log(message);
});

unsubscribe();
```

`sendIpcMessage()` serializes the message with `JSON.stringify()` and forwards the
result to the current native bridge:

- Android: `globalThis.KirieAndroidBridge.postMessage(...)`
- iOS: `globalThis.webkit.messageHandlers.kirie.postMessage(...)`

`onIpcMessageReceived()` listens for `kirie:ipc-message` events dispatched by the
native bridge.
