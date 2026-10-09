import type { DownloadListenerHandle, DownloadSnapshot } from "takanawa-node";
import { lstatSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { execa } from "execa";

import { GODOT_CEF_SHA256, GODOT_CEF_VERSION, KIRIE_ADDON_VERSION } from "../addon-versions.ts";

const KIRIE_ADDON_PATH = "addons/kirie";
const KIRIE_ADDON_FILES = ["plugin.cfg", "plugin.gd", "kirie_node.gd", "gd_kirie.gd"];
const KIRIE_RELEASES_URL = "https://github.com/moeru-ai/godot-kirie/releases/download";
const GODOT_CEF_ADDON_PATH = "addons/godot_cef";
const GODOT_CEF_CHECKSUM_PATH = ".godot/kirie/godot-cef.sha256";
const GODOT_CEF_RELEASES_URL = "https://github.com/dsh0416/godot-cef/releases/download";
const PROGRESS_BAR_WIDTH = 24;

export interface AddonCheckResult {
  installed: boolean;
  message: string;
  valid: boolean;
}

export interface DownloadProgressOutput {
  columns?: number;
  isTTY?: boolean;
  write: (text: string) => unknown;
}

export interface InstallAddonOptions {
  download?: (options: DownloadFileOptions) => Promise<void>;
  extractArchive?: (archivePath: string, outputDir: string) => Promise<void>;
  output?: DownloadProgressOutput;
  projectDir: string;
}

interface DownloadFileOptions {
  expectedSha256?: string;
  output: DownloadProgressOutput;
  outputPath: string;
  url: string;
}

interface AddonArchive {
  name: string;
  version: string;
  url: string;
  addonPath: string;
  archivePath: string;
  expectedSha256?: string;
  checksumPath?: string;
  requiredFiles: string[];
  check: (projectDir: string) => Promise<AddonCheckResult>;
  validate?: (directory: string) => Promise<void>;
}

export async function checkGodotCef(projectDir: string): Promise<AddonCheckResult> {
  const installDir = path.resolve(projectDir, GODOT_CEF_ADDON_PATH);
  const extensionPath = path.join(installDir, `${path.basename(installDir)}.gdextension`);

  if (!lstatSync(installDir, { throwIfNoEntry: false })) {
    return {
      installed: false,
      message: "not installed; required for desktop development",
      valid: true,
    };
  }

  try {
    const extensionStat = await fs.stat(extensionPath);
    const installedSha256 = await fs.readFile(
      path.join(projectDir, GODOT_CEF_CHECKSUM_PATH),
      "utf8",
    );
    if (extensionStat.isFile() && installedSha256.trim() === GODOT_CEF_SHA256) {
      return {
        installed: true,
        message: `${GODOT_CEF_VERSION} at ${installDir}`,
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
    message: `installation at ${installDir} does not match ${GODOT_CEF_VERSION}`,
    valid: false,
  };
}

export async function assertGodotCefInstalled(projectDir: string) {
  const result = await checkGodotCef(projectDir);
  if (result.installed && result.valid) {
    return;
  }

  throw new Error(
    `kirie dev desktop requires Godot CEF for desktop. ${result.message}. Run: pnpm kirie doctor --fix godot-cef`,
  );
}

export async function checkKirieAddon(projectDir: string): Promise<AddonCheckResult> {
  const installDir = path.resolve(projectDir, KIRIE_ADDON_PATH);
  if (!lstatSync(installDir, { throwIfNoEntry: false })) {
    return { installed: false, message: "not installed", valid: false };
  }

  try {
    const files = await Promise.all(
      KIRIE_ADDON_FILES.map((file) => fs.stat(path.join(installDir, file))),
    );
    const version = await readKirieAddonVersion(installDir);
    if (files.every((file) => file.isFile()) && version === KIRIE_ADDON_VERSION) {
      return { installed: true, message: `${version} at ${installDir}`, valid: true };
    }
  } catch (error) {
    if (!isNodeError(error) || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) {
      throw error;
    }
  }

  return {
    installed: true,
    message: `installation at ${installDir} is incomplete or does not match ${KIRIE_ADDON_VERSION}`,
    valid: false,
  };
}

export async function installGodotCef(options: InstallAddonOptions) {
  await installAddon(options, {
    name: "Godot CEF",
    version: GODOT_CEF_VERSION,
    url: `${GODOT_CEF_RELEASES_URL}/v${GODOT_CEF_VERSION}/godot_cef-v${GODOT_CEF_VERSION}.zip`,
    addonPath: GODOT_CEF_ADDON_PATH,
    archivePath: `dist/${GODOT_CEF_ADDON_PATH}`,
    expectedSha256: GODOT_CEF_SHA256,
    checksumPath: GODOT_CEF_CHECKSUM_PATH,
    requiredFiles: ["godot_cef.gdextension"],
    check: checkGodotCef,
  });
}

export async function installKirieAddon(options: InstallAddonOptions) {
  await installAddon(options, {
    name: "Kirie addon",
    version: KIRIE_ADDON_VERSION,
    url: `${KIRIE_RELEASES_URL}/v${KIRIE_ADDON_VERSION}/kirie-addon.zip`,
    addonPath: KIRIE_ADDON_PATH,
    archivePath: KIRIE_ADDON_PATH,
    requiredFiles: KIRIE_ADDON_FILES,
    check: checkKirieAddon,
    validate: async (directory) => {
      const version = await readKirieAddonVersion(directory);
      if (version !== KIRIE_ADDON_VERSION) {
        throw new Error(
          `Kirie addon archive version ${version ?? "missing"} does not match ${KIRIE_ADDON_VERSION}`,
        );
      }
    },
  });
}

async function installAddon(options: InstallAddonOptions, addon: AddonArchive): Promise<void> {
  const projectDir = path.resolve(options.projectDir);
  assertGodotProject(projectDir);

  const current = await addon.check(projectDir);
  if (current.installed && current.valid) {
    console.log(`${addon.name} is already installed: ${current.message}`);
    return;
  }

  const installDir = path.join(projectDir, addon.addonPath);
  await fs.mkdir(path.dirname(installDir), { recursive: true });
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kirie-addon-"));
  const archivePath = path.join(temporaryRoot, "addon.zip");
  const extractDir = path.join(temporaryRoot, "extract");
  const extractedAddon = path.join(extractDir, addon.archivePath);
  let stagingRoot: string | undefined;

  try {
    console.log(`Downloading ${addon.name} ${addon.version} from ${addon.url}`);
    await (options.download ?? downloadFile)({
      expectedSha256: addon.expectedSha256,
      output: options.output ?? process.stderr,
      outputPath: archivePath,
      url: addon.url,
    });

    await fs.mkdir(extractDir);
    await (options.extractArchive ?? extractZip)(archivePath, extractDir);
    for (const file of addon.requiredFiles) {
      const filePath = path.join(extractedAddon, file);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        throw new Error(
          `${addon.name} archive does not contain a file at ${addon.archivePath}/${file}`,
        );
      }
    }
    await addon.validate?.(extractedAddon);

    stagingRoot = await fs.mkdtemp(path.join(path.dirname(projectDir), ".kirie-addon-stage-"));
    const stagedAddon = path.join(stagingRoot, "addon");
    await fs.cp(extractedAddon, stagedAddon, { recursive: true });
    const previousAddon = path.join(stagingRoot, "previous");
    if (current.installed) {
      await renameAddon(installDir, previousAddon);
    }
    try {
      await renameAddon(stagedAddon, installDir);
    } catch (error) {
      if (current.installed) {
        await renameAddon(previousAddon, installDir);
      }
      throw error;
    }
    if (addon.checksumPath) {
      const checksumPath = path.join(projectDir, addon.checksumPath);
      await fs.mkdir(path.dirname(checksumPath), { recursive: true });
      await fs.writeFile(checksumPath, `${addon.expectedSha256}\n`);
    }
  } finally {
    await Promise.all([
      fs.rm(temporaryRoot, { force: true, recursive: true }),
      stagingRoot ? fs.rm(stagingRoot, { force: true, recursive: true }) : Promise.resolve(),
    ]);
  }

  console.log(`Installed ${addon.name} ${addon.version} at ${installDir}`);
}

async function readKirieAddonVersion(directory: string): Promise<string | undefined> {
  const plugin = await fs.readFile(path.join(directory, "plugin.cfg"), "utf8");
  return /^\s*version\s*=\s*"([^"]+)"\s*$/m.exec(plugin)?.[1];
}

function formatDownloadProgress(
  downloadedBytes: number,
  totalBytes: number,
  speed: number,
): string {
  const downloaded = formatBytes(downloadedBytes);
  const speedText = `${formatBytes(speed)}/s`;
  if (totalBytes === 0) {
    return `${downloaded} ${speedText}`;
  }

  const progress = Math.min(downloadedBytes / totalBytes, 1);
  const completeWidth = Math.round(progress * PROGRESS_BAR_WIDTH);
  const bar = `${"=".repeat(completeWidth)}${" ".repeat(PROGRESS_BAR_WIDTH - completeWidth)}`;
  const percent = `${(progress * 100).toFixed(1)}%`.padStart(6);
  return `[${bar}] ${percent} ${speedText} ${downloaded}/${formatBytes(totalBytes)}`;
}

async function downloadFile(options: DownloadFileOptions): Promise<void> {
  // Load the native addon only for the fixer so unsupported hosts can still use other CLI commands.
  const { DownloadTask, TakanawaError, TakanawaStatus } = await import("takanawa-node");
  const task = new DownloadTask({
    hash: options.expectedSha256 ?
        {
          expected: options.expectedSha256,
          kind: "sha256",
        } :
      undefined,
    targetPath: options.outputPath,
    url: options.url,
  });

  let speed = 0;
  let lastProgressLength = 0;
  let progressListener: DownloadListenerHandle | undefined;
  let speedListener: DownloadListenerHandle | undefined;
  let resolveCompletion!: (snapshot: DownloadSnapshot) => void;
  let rejectCompletion!: (error: Error) => void;
  const completion = new Promise<DownloadSnapshot>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  try {
    progressListener = await task.addProgressListener((snapshot) => {
      lastProgressLength = writeDownloadProgress(
        options.output,
        Number(snapshot.downloadedBytes),
        Number(snapshot.contentLen),
        speed,
        lastProgressLength,
      );

      if (snapshot.phase === "completed") {
        resolveCompletion(snapshot);
      } else if (snapshot.phase === "failed") {
        const message =
          snapshot.lastErrorCode === TakanawaStatus.HashMismatch ?
            `Addon checksum mismatch: expected ${options.expectedSha256}` :
              (snapshot.lastError ?? "Takanawa download failed");
        rejectCompletion(new TakanawaError(message, snapshot.lastErrorCode));
      }
    });
    speedListener = await task.addSpeedListener((snapshot) => {
      speed = snapshot.bytesPerSecond;
      lastProgressLength = writeDownloadProgress(
        options.output,
        Number(snapshot.receivedBytes),
        Number(snapshot.contentLen),
        speed,
        lastProgressLength,
      );
    });

    await task.start();
    const snapshot = await completion;
    writeDownloadProgress(
      options.output,
      Number(snapshot.downloadedBytes),
      Number(snapshot.contentLen),
      speed,
      lastProgressLength,
      true,
    );
  } catch (error) {
    if (options.output.isTTY && lastProgressLength > 0) {
      options.output.write("\n");
    }
    throw error;
  } finally {
    await Promise.all([progressListener?.remove(), speedListener?.remove(), task.close()]);
  }
}

function writeDownloadProgress(
  output: DownloadProgressOutput,
  downloadedBytes: number,
  totalBytes: number,
  speed: number,
  previousLength: number,
  complete: boolean = false,
): number {
  const progress = formatDownloadProgress(downloadedBytes, totalBytes, speed);
  if (!output.isTTY) {
    if (complete) {
      output.write(`Downloaded ${progress}\n`);
    }
    return progress.length;
  }

  const availableWidth = Math.max((output.columns ?? 80) - 1, 1);
  const line = progress.slice(0, availableWidth);
  output.write(
    `\r${line}${" ".repeat(Math.max(previousLength - line.length, 0))}${complete ? "\n" : ""}`,
  );
  return line.length;
}

async function extractZip(archivePath: string, outputDir: string): Promise<void> {
  if (process.platform === "win32") {
    const tarExecutable = path.join(process.env.SystemRoot!, "System32", "tar.exe");
    await execa(tarExecutable, ["-xf", archivePath, "-C", outputDir], { stdio: "inherit" });
    return;
  }

  await execa("unzip", ["-q", archivePath, "-d", outputDir], { stdio: "inherit" });
}

function assertGodotProject(projectDir: string): void {
  const projectStat = statSync(path.join(projectDir, "project.godot"), { throwIfNoEntry: false });
  if (projectStat?.isFile()) {
    return;
  }

  throw new Error(`Godot project not found: ${projectDir}`);
}

function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(1)} MiB`;
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
