import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    sourcemap: true,
  },
  entry: {
    index: "src/index.ts",
    "pointer-input/auto": "src/pointer-input/auto.ts",
    "pointer-input/index": "src/pointer-input/index.ts",
  },
  format: "esm",
  platform: "browser",
  sourcemap: true,
  target: false,
});
