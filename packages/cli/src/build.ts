import { buildDotnet, buildViteWeb } from "@gd-kirie/build";

import { loadKirieConfig } from "./config.ts";

export interface BuildOptions {
  cwd?: string;
  mode?: string;
}

export async function runBuild(options: BuildOptions = {}): Promise<void> {
  const config = await loadKirieConfig({
    command: "build",
    cwd: options.cwd,
    mode: options.mode,
  });

  await buildViteWeb({
    mode: config.mode,
    viteConfig: config.web.vite,
    webRoot: config.web.root,
  });
  await buildDotnet({
    projectDir: config.godot.project,
    skipMissingProject: true,
  });
}

export async function runBuildWeb(options: BuildOptions = {}): Promise<void> {
  const config = await loadKirieConfig({
    command: "build",
    cwd: options.cwd,
    mode: options.mode,
  });

  await buildViteWeb({
    mode: config.mode,
    viteConfig: config.web.vite,
    webRoot: config.web.root,
  });
}

export async function runBuildDotnet(options: BuildOptions = {}): Promise<void> {
  await buildDotnet({
    projectDir: options.cwd ?? process.cwd(),
  });
}
