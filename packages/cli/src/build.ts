import { execa } from "execa";

import { loadKirieConfig } from "./config.ts";
import { buildViteWeb } from "./vite.ts";

const DOTNET_NO_PROJECT_ERROR = "MSB1003";

export interface BuildOptions {
  cwd?: string;
}

interface DotnetBuildOptions {
  skipMissingProject?: boolean;
}

export async function runBuild(options: BuildOptions = {}): Promise<void> {
  const config = await loadKirieConfig({
    command: "build",
    cwd: options.cwd,
  });

  await buildViteWeb(config);
  await runDotnetBuild(config.godot.project, {
    skipMissingProject: true,
  });
}

export async function runBuildWeb(options: BuildOptions = {}): Promise<void> {
  const config = await loadKirieConfig({
    command: "build",
    cwd: options.cwd,
  });

  await buildViteWeb(config);
}

export async function runBuildDotnet(options: BuildOptions = {}): Promise<void> {
  await runDotnetBuild(options.cwd ?? process.cwd());
}

async function runDotnetBuild(projectDir: string, options: DotnetBuildOptions = {}): Promise<void> {
  const result = await execa("dotnet", ["build"], {
    all: true,
    cwd: projectDir,
    reject: false,
  });

  if (result.exitCode === 0) {
    process.stdout.write(result.all ?? "");
    return;
  }

  if (options.skipMissingProject && result.all?.includes(DOTNET_NO_PROJECT_ERROR)) {
    console.log("No .NET project found; skipping dotnet build.");
    return;
  }

  process.stdout.write(result.all ?? "");
  throw new Error("dotnet build failed.");
}
