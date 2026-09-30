import type { DownloadFileOptions, DownloadProgressOutput } from "../archive.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import packageJson from "../../package.json" with { type: "json" };
import { downloadFile, extractZip } from "../archive.ts";

export const Addon = {
  Kirie: "kirie",
  GodotCef: "godot-cef",
} as const;
export type AddonId = (typeof Addon)[keyof typeof Addon];

const ADDON_CHECKSUMS_PATH = ".godot/kirie/addons.json";

export interface AddonCheckResult {
  installed: boolean;
  message: string;
  valid: boolean;
}

export interface InstallAddonOptions {
  addon: AddonId;
  projectDir: string;
  download?: (options: DownloadFileOptions) => Promise<void>;
  extractArchive?: (archivePath: string, outputDir: string) => Promise<void>;
  output?: DownloadProgressOutput;
}

interface AddonConfig {
  name: string;
  version: string;
  installDir: string;
  archiveDir: string;
  url: string;
  files: string[];
  sha256: string;
}

interface GodotCefConfigFile {
  addon_path?: unknown;
  class_name?: unknown;
  sha256?: unknown;
  version?: unknown;
}

async function readAddonConfig(projectDir: string, addon: AddonId): Promise<AddonConfig> {
  if (addon === Addon.Kirie) {
    return {
      name: "Kirie addon",
      version: packageJson.version,
      installDir: path.join(projectDir, "addons", "kirie"),
      archiveDir: "addons/kirie",
      url: `https://github.com/moeru-ai/godot-kirie/releases/download/v${packageJson.version}/kirie-addon.zip`,
      sha256: await readKirieReleaseChecksum(),
      files: [
        "plugin.cfg",
        "plugin.gd",
        "export_plugin.gd",
        "gd_kirie.gd",
        "kirie_node.gd",
        "pointer_input_forwarder.gd",
        "godot_cef_config.gd",
        "godot_cef.json",
      ],
    };
  }

  const configPath = path.join(projectDir, "addons", "kirie", "godot_cef.json");
  let parsed: GodotCefConfigFile;
  try {
    parsed = JSON.parse(await fs.readFile(configPath, "utf8")) as GodotCefConfigFile;
  } catch (error) {
    throw new Error(`Could not read Godot CEF configuration at ${configPath}`, { cause: error });
  }

  const addonPath = requireConfigString(parsed.addon_path, "addon_path", configPath);
  requireConfigString(parsed.class_name, "class_name", configPath);
  const sha256 = requireConfigString(parsed.sha256, "sha256", configPath);
  const version = requireConfigString(parsed.version, "version", configPath);

  if (!/^res:\/\/[A-Za-z0-9_./-]+$/.test(addonPath) || addonPath.includes("..")) {
    throw new Error(`Godot CEF addon_path must be a project-local res:// path in ${configPath}`);
  }
  if (!/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new Error(`Godot CEF sha256 must contain 64 hexadecimal characters in ${configPath}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(version)) {
    throw new Error(`Godot CEF version contains unsupported characters in ${configPath}`);
  }

  const installDir = resolveResourcePath(projectDir, addonPath);
  return {
    name: "Godot CEF",
    version,
    installDir,
    archiveDir: `dist/${addonPath.slice("res://".length)}`,
    url: `https://github.com/dsh0416/godot-cef/releases/download/v${version}/godot_cef-v${version}.zip`,
    files: [`${path.basename(installDir)}.gdextension`],
    sha256: sha256.toLowerCase(),
  };
}

async function readKirieReleaseChecksum(): Promise<string> {
  const url = `https://api.github.com/repos/moeru-ai/godot-kirie/releases/tags/v${packageJson.version}`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    throw new Error(`Failed to read Kirie release v${packageJson.version}: ${response.status} ${response.statusText}`);
  }

  const release = await response.json() as { assets: { name: string; digest: string | null }[] };
  const asset = release.assets.find((asset) => asset.name === "kirie-addon.zip");
  const sha256 = typeof asset?.digest === "string" ? /^sha256:([0-9a-f]{64})$/i.exec(asset.digest)?.[1] : undefined;
  if (!sha256) {
    throw new Error(`Kirie release v${packageJson.version} has no SHA-256 digest for kirie-addon.zip`);
  }
  return sha256.toLowerCase();
}

export async function checkAddon(projectDir: string, addon: AddonId): Promise<AddonCheckResult> {
  return checkInstallation(projectDir, addon, await readAddonConfig(projectDir, addon));
}

async function checkInstallation(
  projectDir: string,
  addon: AddonId,
  config: AddonConfig,
): Promise<AddonCheckResult> {
  const checksums = await readAddonChecksums(projectDir);
  try {
    await fs.lstat(config.installDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { installed: false, message: "not installed", valid: true };
    }
    throw error;
  }

  if (checksums[addon] === config.sha256 && await checkFiles(config.installDir, config.files)) {
    return {
      installed: true,
      message: `${config.version} at ${config.installDir}`,
      valid: true,
    };
  }

  return {
    installed: true,
    message: `installation at ${config.installDir} does not match ${config.version}`,
    valid: false,
  };
}

async function readAddonChecksums(projectDir: string): Promise<Partial<Record<AddonId, unknown>>> {
  const checksumPath = path.join(projectDir, ADDON_CHECKSUMS_PATH);
  let checksums: unknown;
  try {
    checksums = JSON.parse(await fs.readFile(checksumPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError || (isNodeError(error) && error.code === "ENOENT")) {
      return {};
    }
    throw error;
  }

  if (checksums === null || typeof checksums !== "object" || Array.isArray(checksums)) {
    return {};
  }
  return checksums;
}

async function checkFiles(addonDir: string, files: string[]): Promise<boolean> {
  try {
    for (const file of files) {
      if (!(await fs.stat(path.join(addonDir, file))).isFile()) {
        return false;
      }
    }
    return true;
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return false;
    }
    throw error;
  }
}

export async function assertGodotCefInstalled(projectDir: string): Promise<void> {
  const result = await checkAddon(projectDir, Addon.GodotCef);
  if (result.installed && result.valid) {
    return;
  }

  throw new Error(
    `kirie dev desktop requires Godot CEF for desktop. ${result.message}. Run: pnpm kirie doctor --fix godot-cef`,
  );
}

export async function installAddon(options: InstallAddonOptions): Promise<void> {
  const projectDir = path.resolve(options.projectDir);
  await assertGodotProject(projectDir);

  const config = await readAddonConfig(projectDir, options.addon);
  const current = await checkInstallation(projectDir, options.addon, config);
  if (current.installed && current.valid) {
    console.log(`${config.name} is already installed: ${current.message}`);
    return;
  }

  await fs.mkdir(path.dirname(config.installDir), { recursive: true });
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kirie-addon-"));
  const archivePath = path.join(temporaryRoot, "addon.zip");
  const extractDir = path.join(temporaryRoot, "extract");
  const extractedAddon = path.join(extractDir, config.archiveDir);
  let stagingRoot: string | undefined;

  try {
    console.log(`Downloading ${config.name} ${config.version} from ${config.url}`);
    await (options.download ?? downloadFile)({
      expectedSha256: config.sha256,
      output: options.output ?? process.stderr,
      outputPath: archivePath,
      url: config.url,
    });

    await fs.mkdir(extractDir);
    await (options.extractArchive ?? extractZip)(archivePath, extractDir);
    if (!(await checkFiles(extractedAddon, config.files))) {
      throw new Error(`${config.name} archive does not contain a valid addon at ${config.archiveDir}`);
    }

    stagingRoot = await fs.mkdtemp(path.join(path.dirname(config.installDir), ".kirie-addon-stage-"));
    const stagedAddon = path.join(stagingRoot, path.basename(config.installDir));
    await fs.cp(extractedAddon, stagedAddon, { recursive: true });
    await fs.rm(config.installDir, { force: true, recursive: true });
    await renameAddon(stagedAddon, config.installDir);
    const checksums = await readAddonChecksums(projectDir);
    checksums[options.addon] = config.sha256;
    const checksumPath = path.join(projectDir, ADDON_CHECKSUMS_PATH);
    await fs.mkdir(path.dirname(checksumPath), { recursive: true });
    await fs.writeFile(checksumPath, `${JSON.stringify(checksums, null, 2)}\n`);
  } finally {
    await Promise.all([
      fs.rm(temporaryRoot, { force: true, recursive: true }),
      stagingRoot ? fs.rm(stagingRoot, { force: true, recursive: true }) : Promise.resolve(),
    ]);
  }

  console.log(`Installed ${config.name} ${config.version} at ${config.installDir}`);
}

async function assertGodotProject(projectDir: string): Promise<void> {
  try {
    const projectStat = await fs.stat(path.join(projectDir, "project.godot"));
    if (projectStat.isFile()) {
      return;
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  throw new Error(`Godot project not found: ${projectDir}`);
}

function requireConfigString(value: unknown, field: string, configPath: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Godot CEF ${field} must be a non-empty string in ${configPath}`);
}

function resolveResourcePath(projectDir: string, resourcePath: string): string {
  const resolved = path.resolve(projectDir, resourcePath.slice("res://".length));
  const relative = path.relative(projectDir, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Godot CEF path must stay inside the Godot project: ${resourcePath}`);
  }
  return resolved;
}

async function renameAddon(source: string, destination: string): Promise<void> {
  // NOTICE:
  // Windows file scanners can hold newly copied native binaries.
  // The lock makes fs.rename fail with EPERM, EACCES, or EBUSY.
  // Context: https://github.com/isaacs/node-graceful-fs/blob/main/polyfills.js
  // Remove this retry only if Node handles transient Windows rename errors.
  const retryStartedAt = Date.now();
  let retryDelay = 0;

  for (;;) {
    try {
      await fs.rename(source, destination);
      return;
    } catch (error) {
      const canRetry =
        process.platform === "win32" &&
        Date.now() - retryStartedAt < 60_000 &&
        isNodeError(error) &&
        (error.code === "EACCES" || error.code === "EBUSY" || error.code === "EPERM");
      if (!canRetry) {
        throw error;
      }

      retryDelay = Math.min(retryDelay + 10, 100);
      await delay(retryDelay);
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
