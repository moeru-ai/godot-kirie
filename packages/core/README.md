# `@gd-kirie/core`

Default Kirie plugin descriptor for the WebView and IPC stack.

```ts
import core from "@gd-kirie/core";
import { defineKirieConfig } from "kirie";

export default defineKirieConfig({
  plugins: [core],
});
```

Run `kirie doctor --fix plugin:core` after configuring the plugin. Doctor
copies the bundled Kirie addon and downloads the SHA-256-pinned desktop Godot
CEF backend declared here.
