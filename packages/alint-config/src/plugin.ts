import type { PluginDefinition } from "@alint-js/core";
import { definePlugin } from "@alint-js/core";
import { noStringifiedRethrowRule } from "./rules/no-stringified-rethrow";

export const gdKirieAlintPlugin: PluginDefinition = definePlugin({
  rules: {
    "no-stringified-rethrow": noStringifiedRethrowRule,
  },
});
