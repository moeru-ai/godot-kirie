import fs from "node:fs";
import path from "node:path";
import { createServer, type InlineConfig, mergeConfig, type ViteDevServer } from "vite";

import type { ResolvedKirieConfig } from "./config.ts";

const KIRIE_OWNED_VITE_OPTIONS = ["root", "base"] as const;
const KIRIE_OWNED_VITE_SERVER_OPTIONS = ["host", "port", "strictPort", "open"] as const;
const KIRIE_OWNED_VITE_BUILD_OPTIONS = ["outDir"] as const;

export interface StartedViteServer {
  server: ViteDevServer;
  url: string;
}

export async function startViteDevServer(config: ResolvedKirieConfig): Promise<StartedViteServer> {
  assertWebEntryExists(config.web.root);

  const server = await createServer(createViteConfig(config));

  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }

  const url = server.resolvedUrls?.local[0];

  if (!url) {
    await server.close();
    throw new Error("Vite did not report a local dev server URL.");
  }

  return {
    server,
    url,
  };
}

export function createViteConfig(config: ResolvedKirieConfig): InlineConfig {
  assertNoKirieOwnedViteOptions(config.web.vite as Record<string, unknown>);

  return mergeConfig(config.web.vite, {
    base: "./",
    build: {
      outDir: "dist",
    },
    configFile: false,
    root: config.web.root,
    server: {
      host: "127.0.0.1",
      open: false,
      port: 5173,
      strictPort: false,
    },
  }) as InlineConfig;
}

function assertWebEntryExists(webRoot: string): void {
  const indexPath = path.join(webRoot, "index.html");

  if (fs.existsSync(indexPath)) {
    return;
  }

  throw new Error(`Kirie dev requires ${indexPath}.`);
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
