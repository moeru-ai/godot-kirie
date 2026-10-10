# `@gd-kirie/tray`

`@gd-kirie/tray` exposes system tray and native menu capabilities over an
existing Kirie Eventa context.

Install the plugin explicitly in `kirie.config.ts`:

```ts
import tray from "@gd-kirie/tray/plugin";
import { defineKirieConfig } from "kirie";
import core from "kirie/plugin/core";

export default defineKirieConfig({
  plugins: [core, tray],
});
```

Create the browser client from the same context used by the application:

```ts
import { createContext } from "@gd-kirie/ipc-eventa";
import { createTrayClient, trayMenuItemActivated } from "@gd-kirie/tray";

const eventa = createContext();
const tray = createTrayClient(eventa.context);

await tray.configure({
  icon: "res://tray-template.svg",
  iconAsTemplate: true,
  tooltip: "Kirie",
});
await tray.setMenu([
  { id: "show", text: "Show Kirie" },
  { id: "enabled", text: "Enabled", type: "check", checked: true },
]);
const stop = eventa.context.on(trayMenuItemActivated, ({ body }) => console.log(body?.id));
await tray.updateItem({ id: "enabled", checked: false });
```

Browser icons are imported Godot resources referenced by `res://` paths. Use
black artwork with transparency when `iconAsTemplate` is enabled. The option is
supported only on macOS; other platforms reject `true`. See Apple's
[`NSImage.isTemplate`](https://developer.apple.com/documentation/appkit/nsimage/istemplate)
documentation for the native rendering behavior.

Menu types are `item`, `check`, `radio`, `multistate`, `separator`, and
`submenu`. IDs must be non-empty and unique across the menu tree. The tray
survives browser reloads and is destroyed explicitly or with its C# host.
