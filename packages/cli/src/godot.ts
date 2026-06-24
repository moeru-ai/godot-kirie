import { prepareGodotProject as prepareGodotProjectWithBuildApi } from "@gd-kirie/build";
import { execa } from "execa";

import type { ResolvedKirieConfig } from "./config.ts";

export async function prepareGodotProject(config: ResolvedKirieConfig): Promise<void> {
  await prepareGodotProjectWithBuildApi({
    godotArgs: config.godot.args,
    godotCommand: config.godot.command,
    projectDir: config.godot.project,
  });
}

export function launchGodot(
  config: ResolvedKirieConfig,
  userArgs: string[] = [],
): ReturnType<typeof execa> {
  const args = [...config.godot.args, "--path", config.godot.project];
  if (userArgs.length > 0) {
    args.push("--", ...userArgs);
  }

  return execa(config.godot.command, args, {
    cwd: config.godot.project,
    forceKillAfterDelay: 5_000,
    stdio: "inherit",
  });
}
