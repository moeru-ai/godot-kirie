import path from "node:path";
import { type ExportMode, exportGodotPreset } from "@gd-kirie/build";
import { runBuild } from "./build.ts";
import { loadKirieConfig, type ResolvedKirieConfig } from "./config.ts";

export type ExportPlatform = "android" | "ios";

export interface ExportOptions {
  build?: boolean;
  config?: ResolvedKirieConfig;
  cwd?: string;
  godotCommand?: string;
  mode?: string;
  output?: string;
  platform?: ExportPlatform;
  preset?: string;
  release?: boolean;
  userArgs?: string[];
}

const DEFAULT_PLATFORM_PRESETS: Record<ExportPlatform, string> = {
  android: "Android",
  ios: "iOS",
};

export async function runExport(options: ExportOptions = {}): Promise<void> {
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
      mode: options.mode,
    }));
  const preset = options.preset ?? resolvePlatformPreset(options.platform);
  const mode = resolveExportMode(options);
  const outputPath = resolveExportOutputPath({
    configCwd: config.cwd,
    mode,
    output: options.output,
    platform: options.platform,
    preset,
  });

  if (options.build !== false) {
    await runBuild({
      cwd: config.cwd,
      mode: config.mode,
    });
  }

  await exportGodotPreset({
    godotArgs: config.godot.args,
    godotCommand: options.godotCommand ?? config.godot.command,
    installAndroidBuildTemplate: preset === DEFAULT_PLATFORM_PRESETS.android,
    mode,
    outputPath,
    preset,
    projectDir: config.godot.project,
    userArgs: options.userArgs,
  });
}

function resolvePlatformPreset(platform: ExportPlatform | undefined): string {
  if (!platform) {
    throw new Error("Missing export platform or preset.");
  }

  return DEFAULT_PLATFORM_PRESETS[platform];
}

function resolveExportMode(options: ExportOptions): ExportMode {
  if (options.release) {
    return "release";
  }

  return "debug";
}

export function resolveExportOutputPath(options: {
  configCwd: string;
  mode: ExportMode;
  output?: string;
  platform?: ExportPlatform;
  preset: string;
}): string {
  if (options.output) {
    return path.resolve(options.configCwd, options.output);
  }

  const platformName = options.platform ?? options.preset.toLowerCase().replaceAll(/\W+/g, "-");
  const extension = platformName === "android" ? "apk" : "xcodeproj";
  return path.resolve(
    options.configCwd,
    "dist",
    "kirie",
    platformName,
    `${options.mode}.${extension}`,
  );
}
