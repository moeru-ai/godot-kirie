import type { DownloadFileOptions, DownloadProgressOutput } from "../archive.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { downloadFile, extractZip } from "../archive.ts";
import { installAddon, isAddonCurrent } from "../init.ts";

const GODOT_CEF_CONFIG_PATH = "addons/kirie/godot_cef.json";
const GODOT_CEF_CHECKSUM_PATH = ".godot/kirie/godot-cef.sha256";
const GODOT_CEF_RELEASES_URL = "https://github.com/dsh0416/godot-cef/releases/download";

export interface GodotCefConfig {
  addonPath: string;
  className: string;
  sha256: string;
  version: string;
}

export interface GodotCefCheckResult {
  installed: boolean;
  message: string;
  valid: boolean;
}

export interface InstallGodotCefOptions {
  download?: (options: DownloadFileOptions) => Promise<void>;
  extractArchive?: (archivePath: string, outputDir: string) => Promise<void>;
  output?: DownloadProgressOutput;
  projectDir: string;
}

interface GodotCefConfigFile {
  addon_path?: unknown;
  class_name?: unknown;
  sha256?: unknown;
  version?: unknown;
}

export async function readGodotCefConfig(projectDir: string): Promise<GodotCefConfig> {
  const configPath = path.join(projectDir, GODOT_CEF_CONFIG_PATH);
  let parsed: GodotCefConfigFile;
  try {
    parsed = JSON.parse(await fs.readFile(configPath, "utf8")) as GodotCefConfigFile;
  } catch (error) {
    throw new Error(`Could not read Godot CEF configuration at ${configPath}`, { cause: error });
  }

  const addonPath = requireConfigString(parsed.addon_path, "addon_path", configPath);
  const className = requireConfigString(parsed.class_name, "class_name", configPath);
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

  return { addonPath, className, sha256: sha256.toLowerCase(), version };
}

export async function checkGodotCef(projectDir: string): Promise<GodotCefCheckResult> {
  const config = await readGodotCefConfig(projectDir);
  const installDir = resolveResourcePath(projectDir, config.addonPath);
  const extensionPath = path.join(installDir, `${path.basename(installDir)}.gdextension`);

  try {
    await fs.lstat(installDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        installed: false,
        message: "not installed; required for desktop development",
        valid: true,
      };
    }
    throw error;
  }

  try {
    const extensionStat = await fs.stat(extensionPath);
    const installedSha256 = await fs.readFile(
      path.join(projectDir, GODOT_CEF_CHECKSUM_PATH),
      "utf8",
    );
    if (extensionStat.isFile() && installedSha256.trim() === config.sha256) {
      return {
        installed: true,
        message: `${config.version} at ${installDir}`,
        valid: true,
      };
    }
  } catch (error) {
    if (!isNodeError(error) || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) {
      throw error;
    }
  }

  return {
    installed: true,
    message: `installation at ${installDir} does not match ${config.version}`,
    valid: false,
  };
}

export async function assertGodotCefInstalled(projectDir: string): Promise<void> {
  const result = await checkGodotCef(projectDir);
  if (result.installed && result.valid) {
    return;
  }

  throw new Error(
    `kirie dev desktop requires Godot CEF for desktop. ${result.message}. Run: pnpm kirie doctor --fix godot-cef`,
  );
}

export async function installGodotCef(options: InstallGodotCefOptions): Promise<void> {
  const projectDir = path.resolve(options.projectDir);
  await assertGodotProject(projectDir);

  if (!(await isAddonCurrent(projectDir))) {
    await installAddon(projectDir, options.output);
  }

  const config = await readGodotCefConfig(projectDir);
  const current = await checkGodotCef(projectDir);
  if (current.installed && current.valid) {
    console.log(`Godot CEF is already installed: ${current.message}`);
    return;
  }
  const installDir = resolveResourcePath(projectDir, config.addonPath);
  const installParent = path.dirname(installDir);
  await fs.mkdir(installParent, { recursive: true });

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kirie-godot-cef-"));
  const assetName = `godot_cef-v${config.version}.zip`;
  const archivePath = path.join(temporaryRoot, assetName);
  const extractDir = path.join(temporaryRoot, "extract");
  const addonProjectPath = config.addonPath.slice("res://".length);
  const extractedAddon = path.join(extractDir, "dist", addonProjectPath);
  const extensionPath = path.join(extractedAddon, `${path.basename(installDir)}.gdextension`);
  const downloadUrl = `${GODOT_CEF_RELEASES_URL}/v${config.version}/${assetName}`;
  let stagingRoot: string | undefined;

  try {
    console.log(`Downloading Godot CEF ${config.version} from ${downloadUrl}`);
    await (options.download ?? downloadFile)({
      expectedSha256: config.sha256,
      output: options.output ?? process.stderr,
      outputPath: archivePath,
      url: downloadUrl,
    });

    await fs.mkdir(extractDir);
    await (options.extractArchive ?? extractZip)(archivePath, extractDir);

    let extensionStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      extensionStat = await fs.stat(extensionPath);
    } catch (error) {
      throw new Error(`Godot CEF archive does not contain dist/${addonProjectPath}`, {
        cause: error,
      });
    }
    if (!extensionStat.isFile()) {
      throw new Error(`Godot CEF archive does not contain dist/${addonProjectPath}`);
    }

    stagingRoot = await fs.mkdtemp(path.join(path.dirname(projectDir), ".kirie-godot-cef-stage-"));
    const stagedAddon = path.join(stagingRoot, path.basename(installDir));
    await fs.cp(extractedAddon, stagedAddon, { recursive: true });
    await fs.rm(installDir, { force: true, recursive: true });
    await renameGodotCefAddon(stagedAddon, installDir);
    const checksumPath = path.join(projectDir, GODOT_CEF_CHECKSUM_PATH);
    await fs.mkdir(path.dirname(checksumPath), { recursive: true });
    await fs.writeFile(checksumPath, `${config.sha256}\n`);
  } finally {
    await Promise.all([
      fs.rm(temporaryRoot, { force: true, recursive: true }),
      stagingRoot ? fs.rm(stagingRoot, { force: true, recursive: true }) : Promise.resolve(),
    ]);
  }

  console.log(`Installed Godot CEF ${config.version} at ${installDir}`);
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

async function renameGodotCefAddon(source: string, destination: string): Promise<void> {
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
