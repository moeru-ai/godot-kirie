import { execa } from "execa";

import type { ResolvedKirieConfig } from "./config.ts";

export async function prepareGodotProject(config: ResolvedKirieConfig): Promise<void> {
  await execa(
    config.godot.command,
    [...config.godot.args, "--headless", "--path", config.godot.project, "--import"],
    {
      cwd: config.godot.project,
      stdio: "inherit",
    },
  );
}

export function launchGodot(config: ResolvedKirieConfig, webUrl: string): ReturnType<typeof execa> {
  return execa(config.godot.command, [...config.godot.args, "--path", config.godot.project], {
    cwd: config.godot.project,
    env: {
      KIRIE_DEV: "1",
      KIRIE_WEB_URL: webUrl,
    },
    forceKillAfterDelay: 5_000,
    stdio: "inherit",
  });
}
