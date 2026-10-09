import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    sourcemap: true,
  },
  entry: {
    cli: "src/cli.ts",
    core: "src/core.ts",
    index: "src/index.ts",
    plugin: "src/plugin.ts",
  },
  fixedExtension: false,
  format: "esm",
  platform: "node",
  sourcemap: true,
  target: false,
});
