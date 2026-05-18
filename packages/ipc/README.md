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

The package exposes three Android channels backed by CBOR packets and AndroidX
WebKit ArrayBuffer messages:

- `sendText()` / `onTextReceived()` for CBOR text strings
- `sendBinary()` / `onBinaryReceived()` for CBOR byte strings
- `sendData()` / `onDataReceived()` for CBOR-encoded structured data through `cborg`

The structured data subset is limited to `null`, booleans, numbers, strings,
arrays, and objects with string keys. JSON message shapes are a caller or
adapter convention and should be sent with `sendText()` when needed.

This package is currently wired to AndroidX WebKit message channels. iOS still
uses the previous native path and is not part of this experimental API break.
