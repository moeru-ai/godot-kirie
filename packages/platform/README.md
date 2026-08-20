# `@gd-kirie/platform`

`@gd-kirie/platform` exposes a small browser-side API for interacting with the
Godot window that hosts a Kirie WebView. Create the client from an existing
`@gd-kirie/ipc-eventa` context.

```ts
import { createContext } from "@gd-kirie/ipc-eventa";
import { createPlatformClient } from "@gd-kirie/platform";

const eventa = createContext();
const platform = createPlatformClient(eventa.context);

await platform.hostWindow.setAlwaysOnTop(true);

const pointer = await platform.hostWindow.getPointerPosition();
console.log(pointer.x, pointer.y, pointer.inside);
eventa.dispose();
```

## Host window

- pointer position relative to the host window, including while it is
  click-through
- pointer passthrough
- native move and resize gestures
- always-on-top
- centering on the current display

Pointer coordinates use host-window pixels and are not normalized to the
browser viewport. `getPointerPosition()` returns a single snapshot.
