import type { KirieGodotAddonDependency, KiriePlugin } from "./plugin.ts";
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
    csproj?: string;
    project?: string;
  };
  plugins?: KiriePlugin[];
  web?: {
    root?: string;
    vite?: UserConfig;
  };
}

export interface ResolvedKirieConfig {
  configFile?: string;
  cwd: string;
  mode: string;
  plugins: KiriePlugin[];
  godot: {
    args: string[];
    command: string;
    csproj?: string;
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

function getAddonSignature(addon: KirieGodotAddonDependency): string {
  const source = addon.source.type === "package" ?
      ["package", addon.source.url] :
      [
        "archive",
        addon.source.url,
        addon.source.sha256,
        addon.source.archivePath,
        addon.source.checksumPath,
      ];

  return JSON.stringify([
    addon.id,
    addon.version,
    addon.requiredFiles.toSorted(),
    source,
  ]);
}

function validatePlugins(plugins: KiriePlugin[], project: string): void {
  const pluginIds = new Set<string>();
  const addonDestinations = new Map<string, { pluginId: string; signature: string }>();

  for (const plugin of plugins) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(plugin.id)) {
      throw new Error(`Invalid Kirie plugin ID: ${plugin.id}`);
    }

    if (pluginIds.has(plugin.id)) {
      throw new Error(`Duplicate Kirie plugin ID: ${plugin.id}`);
    }

    pluginIds.add(plugin.id);

    for (const addon of plugin.dependencies?.godotAddons ?? []) {
      const destination = path.resolve(project, addon.path);
      const relative = path.relative(project, destination);

      if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Kirie plugin ${plugin.id} addon path escapes the Godot project: ${addon.path}`);
      }

      const signature = getAddonSignature(addon);
      const existing = addonDestinations.get(destination);

      if (existing && existing.signature !== signature) {
        throw new Error(
          `Kirie plugins ${existing.pluginId} and ${plugin.id} declare incompatible addons at ${addon.path}`,
        );
      }

      addonDestinations.set(destination, { pluginId: plugin.id, signature });
    }
  }
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
  const plugins = config.plugins ?? [];

  validatePlugins(plugins, project);

  return {
    configFile: context.configFile,
    cwd: context.cwd,
    mode: context.mode ?? "production",
    plugins,
    godot: {
      args: godot.args ?? [],
      command: godot.command ?? "godot",
      csproj: godot.csproj ? path.resolve(project, godot.csproj) : undefined,
      project,
    },
    web: {
      root: webRoot,
      vite: web.vite ?? {},
    },
  };
}
