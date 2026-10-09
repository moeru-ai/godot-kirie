import { URL } from "node:url";
import { defineKiriePlugin, type KiriePlugin } from "kirie/plugin";

import packageJson from "../package.json" with { type: "json" };

const version = packageJson.version;
const addonUrl = new URL("../addon/kirie", import.meta.url).href;

const corePlugin: KiriePlugin = defineKiriePlugin({
  id: "core",
  dependencies: {
    godotAddons: [
      {
        id: "kirie",
        name: "Kirie addon",
        path: "addons/kirie",
        requiredFiles: ["plugin.cfg", "plugin.gd", "kirie_node.gd", "gd_kirie.gd"],
        source: {
          type: "package",
          url: addonUrl,
        },
        version,
      },
      {
        id: "godot-cef",
        name: "Godot CEF",
        optional: true,
        path: "addons/godot_cef",
        platforms: ["desktop"],
        requiredFiles: ["godot_cef.gdextension"],
        source: {
          type: "archive",
          archivePath: "dist/addons/godot_cef",
          checksumPath: ".godot/kirie/godot-cef.sha256",
          sha256: "51adbd1c4bae7dc53c6d64226ecce3cdefedf71a69f86ccb0f8f3db4d978c838",
          url: "https://github.com/dsh0416/godot-cef/releases/download/v2.0.0/godot_cef-v2.0.0.zip",
        },
        version: "2.0.0",
      },
    ],
  },
});

export default corePlugin;
