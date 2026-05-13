# @gd-kirie/ipc

Thin browser-side IPC transport for Kirie WebView pages.

The package is imported by web content running inside a Kirie WebView. Native platforms continue to provide the low
level bridge on `globalThis`, and this package only wraps that bridge with a small typed module API.

## API

```ts
import { onTextReceived, sendText } from "@gd-kirie/ipc";

sendText("web_ready");

const unsubscribe = onTextReceived((message) => {
  console.log(message);
});

unsubscribe();
```

The package exposes three packet lanes:

- `sendText()` / `onTextReceived()` for CBOR text strings
- `sendBinary()` / `onBinaryReceived()` for CBOR byte strings
- `sendData()` / `onDataReceived()` for CBOR-encoded structured data through `cborg`

The data lane accepts null, booleans, finite numbers, strings, arrays, and
plain string-key objects. Integer values must stay inside the JavaScript safe
integer range. Bytes, `undefined`, duplicate map keys, indefinite CBOR values,
invalid UTF-8 text, overly deep nesting, and non-finite numbers are rejected.
Outgoing fractional numbers are encoded as CBOR float64. Incoming data accepts
CBOR float16, float32, and float64, then rejects non-finite decoded values.

Android exposes these lanes through AndroidX WebKit message channels. iOS
exposes the same `Kirie*Channel` page API through injected WebKit shims; its
`WKScriptMessageHandler` boundary carries base64 strings internally, while page
code and Godot still see byte packets.
