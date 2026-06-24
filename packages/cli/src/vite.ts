import fs from "node:fs";
import path from "node:path";
import { build, createServer, type InlineConfig, mergeConfig, type ViteDevServer } from "vite";

import type { ResolvedKirieConfig } from "./config.ts";

const KIRIE_OWNED_VITE_OPTIONS = ["root", "base"] as const;
const KIRIE_OWNED_VITE_SERVER_OPTIONS = ["host", "port", "strictPort", "open"] as const;
const KIRIE_OWNED_VITE_BUILD_OPTIONS = ["outDir"] as const;

export interface StartedViteServer {
  server: ViteDevServer;
  url: string;
}

export interface StartViteDevServerOptions {
  clearScreen?: boolean;
  force?: boolean;
  host?: string;
  logLevel?: "info" | "warn" | "error" | "silent";
  port?: number;
  preferNetworkUrl?: boolean;
  strictPort?: boolean;
}

export async function startViteDevServer(
  config: ResolvedKirieConfig,
  options: StartViteDevServerOptions = {},
): Promise<StartedViteServer> {
  assertWebEntryExists(config.web.root, "Kirie dev");

  const server = await createServer(createViteConfig(config, options));

  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }

  const localUrl = server.resolvedUrls?.local[0];
  const networkUrl = server.resolvedUrls?.network[0];
  const url = options.preferNetworkUrl ? (networkUrl ?? localUrl) : (localUrl ?? networkUrl);

  if (!url) {
    await server.close();
    throw new Error("Vite did not report a local dev server URL.");
  }

  return {
    server,
    url,
  };
}

export async function buildViteWeb(config: ResolvedKirieConfig): Promise<void> {
  assertWebEntryExists(config.web.root, "Kirie build web");

  await build(createViteConfig(config));
}

export function createViteConfig(
  config: ResolvedKirieConfig,
  options: StartViteDevServerOptions = {},
): InlineConfig {
  assertNoKirieOwnedViteOptions(config.web.vite as Record<string, unknown>);

  return mergeConfig(config.web.vite, {
    base: "./",
    build: {
      outDir: "dist",
    },
    clearScreen: options.clearScreen,
    configFile: false,
    force: options.force,
    logLevel: options.logLevel,
    mode: config.mode,
    root: config.web.root,
    server: {
      host: options.host ?? "127.0.0.1",
      open: false,
      port: options.port ?? 5173,
      strictPort: options.strictPort ?? false,
    },
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

  const build = viteConfig.build;
  if (build && typeof build === "object") {
    assertNoOwnedOptions(
      build as Record<string, unknown>,
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
