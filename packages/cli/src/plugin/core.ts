import type { KiriePlugin } from "./index.ts";
import { URL } from "node:url";

import packageJson from "../../package.json" with { type: "json" };

const addonUrl = new URL("../../addon/kirie", import.meta.url).href;

const corePlugin: KiriePlugin = {
  id: "core",
  godotAddons: [
    {
      id: "kirie",
      path: "addons/kirie",
      requiredFiles: ["plugin.cfg", "plugin.gd", "kirie_node.gd", "gd_kirie.gd"],
      source: {
        type: "package",
        url: addonUrl,
      },
      version: packageJson.version,
    },
    {
      id: "godot-cef",
      optional: true,
      path: "addons/godot_cef",
      requiredFiles: ["godot_cef.gdextension"],
      source: {
        type: "archive",
        archivePath: "dist/addons/godot_cef",
        sha256: "51adbd1c4bae7dc53c6d64226ecce3cdefedf71a69f86ccb0f8f3db4d978c838",
        url: "https://github.com/dsh0416/godot-cef/releases/download/v2.0.0/godot_cef-v2.0.0.zip",
      },
      version: "2.0.0",
    },
  ],
};

export default corePlugin;
