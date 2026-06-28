import { noStringifiedRethrowRule } from "./rules/no-stringified-rethrow";
import type { PluginDefinition } from "./types";

export const gdKirieAlintPlugin: PluginDefinition = {
  rules: {
    "no-stringified-rethrow": noStringifiedRethrowRule,
  },
  scope: "@gd-kirie",
};
