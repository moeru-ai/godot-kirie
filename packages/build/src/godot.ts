import fs from "node:fs";
import path from "node:path";
import { type Options as ExecaOptions, execa } from "execa";

export type ExportMode = "debug" | "release";

export interface GodotCommandOptions {
  godotArgs?: string[];
  godotCommand: string;
  projectDir: string;
  stdio?: ExecaOptions["stdio"];
}

export interface PrepareGodotProjectOptions extends GodotCommandOptions {}

export interface ExportGodotPresetOptions extends GodotCommandOptions {
  installAndroidBuildTemplate?: boolean;
  mode: ExportMode;
  outputPath: string;
  preset: string;
  userArgs?: string[];
}

export async function prepareGodotProject(options: PrepareGodotProjectOptions): Promise<void> {
  await execa(
    options.godotCommand,
    [...(options.godotArgs ?? []), "--headless", "--path", options.projectDir, "--import"],
    {
      cwd: options.projectDir,
      stdio: options.stdio ?? "inherit",
    },
  );
}

export async function exportGodotPreset(options: ExportGodotPresetOptions): Promise<void> {
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });

  const args = [...(options.godotArgs ?? []), "--headless", "--path", options.projectDir];

  if (options.installAndroidBuildTemplate) {
    args.push("--install-android-build-template");
  }

  args.push(
    options.mode === "debug" ? "--export-debug" : "--export-release",
    options.preset,
    options.outputPath,
  );

  if (options.userArgs && options.userArgs.length > 0) {
    args.push("--", ...options.userArgs);
  }

  await execa(options.godotCommand, args, {
    cwd: options.projectDir,
    stdio: options.stdio ?? "inherit",
  });
}
