import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    sourcemap: true,
  },
  entry: {
    index: "src/index.ts",
    plugin: "src/plugin.ts",
  },
  format: "esm",
  platform: "browser",
  sourcemap: true,
  target: false,
});
