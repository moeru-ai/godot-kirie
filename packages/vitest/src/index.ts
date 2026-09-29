import type { PoolRunnerInitializer } from "vitest/node";

import { fileURLToPath } from "node:url";
import { vidot } from "@vidot/vitest";

export type KirieTestTarget = "android" | "desktop" | "ios";

export interface KirieTestOptions {
  projectPath: string;
  target?: KirieTestTarget;
}

export function kirie(options: KirieTestOptions): PoolRunnerInitializer {
  const launcherPath = fileURLToPath(import.meta.resolve("#launcher"));

  return vidot({
    projectPath: options.projectPath,
    godotPath: process.execPath,
    launch: () => ({
      args: [launcherPath, `--kirie-target=${options.target ?? "desktop"}`],
    }),
  });
}
