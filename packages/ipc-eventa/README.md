# @gd-kirie/ipc-eventa

Eventa adapter for Kirie WebView pages.

The package connects upstream `@moeru/eventa` contexts to Kirie's low-level
text IPC lane. Eventa messages are serialized as JSON text and sent through
`@gd-kirie/ipc`; Kirie core remains a transport layer and does not learn
Eventa semantics.

This first transport is debug-first and text-based. A later binary or structured
transport should use Kirie's CBOR-backed data or binary lane directly, exposed
as an explicit opt-in before it becomes the default.

## Events

```ts
import { defineEventa } from "@moeru/eventa";
import { createContext } from "@gd-kirie/ipc-eventa";

const move = defineEventa<{ x: number; y: number }>("player:move");
const { context, dispose } = createContext();

context.on(move, ({ body }) => {
  console.log(body.x, body.y);
});

context.emit(move, { x: 100, y: 200 });

dispose();
```

## Unary RPC

```ts
import { defineInvoke, defineInvokeEventa } from "@moeru/eventa";
import { createContext } from "@gd-kirie/ipc-eventa";

const lookupUser = defineInvokeEventa<{ id: string }, { name: string }>("user:lookup");
const { context } = createContext();
const invokeLookupUser = defineInvoke(context, lookupUser);

const user = await invokeLookupUser({ name: "alice" });
console.log(user.id);
```

Validate payloads at application boundaries before sending them to untrusted
peers. The adapter forwards Eventa payloads as JSON text and does not perform
application schema validation.
