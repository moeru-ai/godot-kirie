import { kirie, type KirieTestTarget } from "@gd-kirie/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    isolate: false,
    pool: kirie({
      projectPath: import.meta.dirname,
      target: process.env.KIRIE_TEST_TARGET as KirieTestTarget | undefined,
    }),
  },
});
