# `@gd-kirie/platform`

`@gd-kirie/platform` exposes browser-side desktop capabilities supplied by the
Godot host. Create the client from an existing `@gd-kirie/ipc-eventa` context.

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

## Global shortcuts

The macOS host can register a shortcut that remains active while the Godot
window is hidden or unfocused:

```ts
const shortcut = {
  keycode: 0x4b, // Godot Key.K
  shiftPressed: false,
  altPressed: false,
  ctrlPressed: false,
  metaPressed: false,
  commandOrControlAutoremap: true,
};

await platform.globalShortcuts.register(shortcut, ({ state }) => {
  console.log(state); // "pressed" or "released"
});

await platform.globalShortcuts.unregister(shortcut);
```

`keycode` uses Godot's logical `Key` values. Every modifier field is required;
`commandOrControlAutoremap` selects Command on macOS. One `onKeyEvent` handler
receives both states; keyboard auto-repeat does not produce extra calls.

The Windows and Linux backends are planned by
[ADR-0002](../../docs/decisions/0002-add-system-wide-global-shortcuts.md) but
have not been implemented yet.
