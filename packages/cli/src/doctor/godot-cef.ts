import type { DownloadListenerHandle, DownloadSnapshot } from "takanawa-node";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { execa } from "execa";

import { GODOT_CEF_SHA256, GODOT_CEF_VERSION } from "../addon-versions.ts";

const GODOT_CEF_ADDON_PATH = "addons/godot_cef";
const GODOT_CEF_CHECKSUM_PATH = ".godot/kirie/godot-cef.sha256";
const GODOT_CEF_RELEASES_URL = "https://github.com/dsh0416/godot-cef/releases/download";
const PROGRESS_BAR_WIDTH = 24;

export interface GodotCefCheckResult {
  installed: boolean;
  message: string;
  valid: boolean;
}

export interface DownloadProgressOutput {
  columns?: number;
  isTTY?: boolean;
  write: (text: string) => unknown;
}

export interface InstallGodotCefOptions {
  download?: (options: DownloadFileOptions) => Promise<void>;
  extractArchive?: (archivePath: string, outputDir: string) => Promise<void>;
  output?: DownloadProgressOutput;
  projectDir: string;
}

interface DownloadFileOptions {
  expectedSha256: string;
  output: DownloadProgressOutput;
  outputPath: string;
  url: string;
}

export async function checkGodotCef(projectDir: string): Promise<GodotCefCheckResult> {
  const installDir = path.resolve(projectDir, GODOT_CEF_ADDON_PATH);
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

  const current = await checkGodotCef(projectDir);
  if (current.installed && current.valid) {
    console.log(`Godot CEF is already installed: ${current.message}`);
    return;
  }
  const installDir = path.join(projectDir, GODOT_CEF_ADDON_PATH);
  const installParent = path.dirname(installDir);
  await fs.mkdir(installParent, { recursive: true });

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kirie-godot-cef-"));
  const assetName = `godot_cef-v${GODOT_CEF_VERSION}.zip`;
  const archivePath = path.join(temporaryRoot, assetName);
  const extractDir = path.join(temporaryRoot, "extract");
  const addonProjectPath = GODOT_CEF_ADDON_PATH;
  const extractedAddon = path.join(extractDir, "dist", addonProjectPath);
  const extensionPath = path.join(extractedAddon, `${path.basename(installDir)}.gdextension`);
  const downloadUrl = `${GODOT_CEF_RELEASES_URL}/v${GODOT_CEF_VERSION}/${assetName}`;
  let stagingRoot: string | undefined;

  try {
    console.log(`Downloading Godot CEF ${GODOT_CEF_VERSION} from ${downloadUrl}`);
    await (options.download ?? downloadFile)({
      expectedSha256: GODOT_CEF_SHA256,
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
    await fs.writeFile(checksumPath, `${GODOT_CEF_SHA256}\n`);
  } finally {
    await Promise.all([
      fs.rm(temporaryRoot, { force: true, recursive: true }),
      stagingRoot ? fs.rm(stagingRoot, { force: true, recursive: true }) : Promise.resolve(),
    ]);
  }

  console.log(`Installed Godot CEF ${GODOT_CEF_VERSION} at ${installDir}`);
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
    hash: {
      expected: options.expectedSha256,
      kind: "sha256",
    },
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
            `Godot CEF checksum mismatch: expected ${options.expectedSha256}` :
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

function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(1)} MiB`;
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
