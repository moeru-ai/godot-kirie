import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    sourcemap: true,
  },
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  fixedExtension: false,
  format: "esm",
  platform: "node",
  sourcemap: true,
  target: false,
});
