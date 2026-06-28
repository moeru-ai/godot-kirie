import { gdKirieAlintPlugin } from "./plugin";
import type { AlintConfig } from "./types";

export const gdKirieAlintConfig: AlintConfig = {
  plugins: [gdKirieAlintPlugin],
  rules: {
    "@gd-kirie/no-stringified-rethrow": "warn",
  },
};
