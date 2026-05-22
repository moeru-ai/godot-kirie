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
ArrayBuffer messages:

- `sendText()` / `onTextReceived()` for CBOR text strings
- `sendBinary()` / `onBinaryReceived()` for CBOR byte strings
- `sendData()` / `onDataReceived()` for CBOR-encoded structured data through `cborg`

iOS currently exposes the legacy text bridge through the same `sendText()` and
`onTextReceived()` API. The iOS binary and data lanes are still pending the
native lane migration.

The structured data subset is limited to `null`, booleans, numbers, strings,
arrays, and objects with string keys. JSON message shapes are a caller or
adapter convention and should be sent with `sendText()` when needed.
