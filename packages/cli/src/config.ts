import fs from "node:fs";
import path from "node:path";
import { loadConfigFromFile, type UserConfig } from "vite";

export interface LoadKirieConfigOptions {
  command?: "build" | "serve";
  cwd?: string;
  mode?: string;
}

export interface KirieConfig extends Record<string, unknown> {
  godot?: {
    args?: string[];
    command?: string;
    project?: string;
  };
  web?: {
    root?: string;
    vite?: UserConfig;
  };
}

export interface ResolvedKirieConfig {
  configFile?: string;
  cwd: string;
  mode: string;
  godot: {
    args: string[];
    command: string;
    project: string;
  };
  web: {
    root: string;
    vite: UserConfig;
  };
}

export function defineKirieConfig(config: KirieConfig): KirieConfig {
  return config;
}

export async function loadKirieConfig(
  options: LoadKirieConfigOptions = {},
): Promise<ResolvedKirieConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const command = options.command ?? "serve";
  const mode = options.mode ?? (command === "build" ? "production" : "development");
  const configFile = path.join(cwd, "kirie.config.ts");
  if (!fs.existsSync(configFile)) {
    return resolveKirieConfig(undefined, {
      cwd,
      mode,
    });
  }

  const result = await loadConfigFromFile(
    {
      command,
      isPreview: false,
      mode,
    },
    configFile,
    cwd,
  );
  if (!result) {
    throw new Error(`Could not load Kirie config: ${configFile}`);
  }

  return resolveKirieConfig(result.config as KirieConfig, {
    configFile: result.path,
    cwd,
    mode,
  });
}

export function resolveKirieConfig(
  input: KirieConfig | undefined,
  context: { configFile?: string; cwd: string; mode?: string },
): ResolvedKirieConfig {
  const config = input ?? {};
  const godot = config.godot ?? {};
  const web = config.web ?? {};
  const project = path.resolve(context.cwd, godot.project ?? ".");
  const webRoot = path.resolve(project, web.root ?? "src-web");

  return {
    configFile: context.configFile,
    cwd: context.cwd,
    mode: context.mode ?? "production",
    godot: {
      args: godot.args ?? [],
      command: godot.command ?? "godot",
      project,
    },
    web: {
      root: webRoot,
      vite: web.vite ?? {},
    },
  };
}
