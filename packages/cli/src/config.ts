import path from "node:path";
import { loadConfigFromFile, type UserConfig } from "vite";

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
  configFile: string;
  cwd: string;
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

export async function loadKirieConfig(cwd: string = process.cwd()): Promise<ResolvedKirieConfig> {
  const configFile = path.join(cwd, "kirie.config.ts");
  const result = await loadConfigFromFile(
    {
      command: "serve",
      isPreview: false,
      mode: "development",
    },
    configFile,
    cwd,
  );

  if (!result) {
    throw new Error("Missing kirie.config.ts.");
  }

  return resolveKirieConfig(result.config as KirieConfig, {
    configFile: result.path,
    cwd,
  });
}

export function resolveKirieConfig(
  input: KirieConfig | undefined,
  context: { configFile: string; cwd: string },
): ResolvedKirieConfig {
  const config = input ?? {};
  const godot = config.godot ?? {};
  const web = config.web ?? {};
  const project = path.resolve(context.cwd, godot.project ?? ".");
  const webRoot = path.resolve(project, web.root ?? "src-web");

  return {
    configFile: context.configFile,
    cwd: context.cwd,
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
