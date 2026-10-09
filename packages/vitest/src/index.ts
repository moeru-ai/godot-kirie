import { vidot } from "@vidot/vitest";

export type KirieTestTarget = "android" | "desktop" | "ios";

export interface KirieTestOptions {
  projectPath: string;
  target?: KirieTestTarget;
}

export function kirie(options: KirieTestOptions) {
  return vidot({
    projectPath: options.projectPath,
    godotPath: "kirie-vitest",
    launch: () => ({
      args: [`--kirie-target=${options.target ?? "desktop"}`],
    }),
  });
}
