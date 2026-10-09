import { defineConfig } from "@alint-js/core";
import { gdKirieAlintPlugin } from "./plugin";

export const gdKirieAlintConfig = defineConfig([
  {
    plugins: {
      "@gd-kirie": gdKirieAlintPlugin,
    },
    rules: {
      "@gd-kirie/no-stringified-rethrow": "warn",
    },
  },
]);
