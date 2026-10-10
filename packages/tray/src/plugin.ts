import type { KiriePlugin } from "kirie/plugin";
import { defineKiriePlugin } from "kirie/plugin";
import packageJson from "../package.json" with { type: "json" };

// ADR-0012: Tray is installed explicitly and owns its .NET host dependency.
// See docs/decisions/0012-extract-system-tray-into-a-kirie-plugin.md.
export default defineKiriePlugin({
  id: "tray",
  dotnetPackages: [
    {
      id: "GdKirie.Tray",
      version: packageJson.version,
    },
  ],
}) as KiriePlugin;
