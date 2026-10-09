import { definePlugin } from "@alint-js/core";
import { noStringifiedRethrowRule } from "./rules/no-stringified-rethrow";

export const gdKirieAlintPlugin = definePlugin({
  rules: {
    "no-stringified-rethrow": noStringifiedRethrowRule,
  },
});
