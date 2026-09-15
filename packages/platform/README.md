# `@gd-kirie/platform`

`@gd-kirie/platform` exposes browser-side desktop capabilities supplied by the
Godot host. Create the client from an existing `@gd-kirie/ipc-eventa` context.

```ts
import { createContext } from "@gd-kirie/ipc-eventa";
import { createPlatformClient } from "@gd-kirie/platform";

const eventa = createContext();
const platform = createPlatformClient(eventa.context);

await platform.hostWindow.setAlwaysOnTop(true);

const windowBounds = await platform.hostWindow.getBounds();
const displayBounds = await platform.hostWindow.getCurrentDisplayBounds();
const pointer = await platform.hostWindow.getPointerPosition();
const windowState = await platform.hostWindow.getState();
console.log(windowBounds, displayBounds, pointer, windowState);
eventa.dispose();
```

## External URLs

Use `openExternalUrl()` to open an absolute HTTP or HTTPS URL with the system
browser:

```ts
await platform.openExternalUrl("https://example.com");
```

The Godot host rejects relative URLs and other URI schemes. It uses
[`OS.shell_open()`](https://docs.godotengine.org/en/4.7/classes/class_os.html#class-os-method-shell-open)
to select the system browser.

Use `openApplicationDataDirectory()` to open the current Godot application's
data directory and receive its absolute path:

```ts
const path = await platform.openApplicationDataDirectory();
```

This capability does not accept an arbitrary path.

## Host window

- window position and size in screen coordinates
- current display position and size in screen coordinates
- pointer position relative to the host window, including while it is
  click-through
- pointer passthrough
- native move and resize gestures
- always-on-top
- centering on the current display
- visibility, focus, and minimized-state snapshots and change events

Pointer coordinates use host-window pixels and are not normalized to the
browser viewport. `getPointerPosition()` returns a single snapshot.

`getState()` returns one lifecycle snapshot and starts native state observation.
Call it once during setup. `onStateChanged()` subscribes to later changes and
returns a function that removes the listener.

## Global shortcuts

The macOS and Windows hosts can register a shortcut that remains active while
the Godot window is hidden or unfocused:

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
`commandOrControlAutoremap` selects Command on macOS and Control on Windows.
One `onKeyEvent` handler receives both states; keyboard auto-repeat does not
produce extra calls.
