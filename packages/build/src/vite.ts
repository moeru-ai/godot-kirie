import fs from "node:fs";
import path from "node:path";
import { build, type InlineConfig, mergeConfig, type UserConfig } from "vite";

const KIRIE_OWNED_VITE_OPTIONS = ["root", "base"] as const;
const KIRIE_OWNED_VITE_SERVER_OPTIONS = ["host", "port", "strictPort", "open"] as const;
const KIRIE_OWNED_VITE_BUILD_OPTIONS = ["outDir"] as const;

export interface BuildViteWebOptions {
  mode?: string;
  viteConfig?: UserConfig;
  webRoot: string;
}

export async function buildViteWeb(options: BuildViteWebOptions): Promise<void> {
  assertWebEntryExists(options.webRoot, "Kirie build web");

  await build(createViteBuildConfig(options));
}

export function createViteBuildConfig(options: BuildViteWebOptions): InlineConfig {
  assertNoKirieOwnedViteOptions((options.viteConfig ?? {}) as Record<string, unknown>);

  return mergeConfig(options.viteConfig ?? {}, {
    base: "./",
    build: {
      outDir: "dist",
    },
    configFile: false,
    mode: options.mode,
    root: options.webRoot,
  }) as InlineConfig;
}

function assertWebEntryExists(webRoot: string, commandName: string): void {
  const indexPath = path.join(webRoot, "index.html");

  if (fs.existsSync(indexPath)) {
    return;
  }

  throw new Error(`${commandName} requires ${indexPath}.`);
}

function assertNoKirieOwnedViteOptions(viteConfig: Record<string, unknown>): void {
  assertNoOwnedOptions(viteConfig, "web.vite", KIRIE_OWNED_VITE_OPTIONS);

  const server = viteConfig.server;
  if (server && typeof server === "object") {
    assertNoOwnedOptions(
      server as Record<string, unknown>,
      "web.vite.server",
      KIRIE_OWNED_VITE_SERVER_OPTIONS,
    );
  }

  const buildOptions = viteConfig.build;
  if (buildOptions && typeof buildOptions === "object") {
    assertNoOwnedOptions(
      buildOptions as Record<string, unknown>,
      "web.vite.build",
      KIRIE_OWNED_VITE_BUILD_OPTIONS,
    );
  }
}

function assertNoOwnedOptions(
  config: Record<string, unknown>,
  pathPrefix: string,
  options: readonly string[],
): void {
  for (const option of options) {
    if (option in config) {
      throw new Error(
        `${pathPrefix}.${option} is owned by Kirie and cannot be set in kirie.config.ts.`,
      );
    }
  }
}
