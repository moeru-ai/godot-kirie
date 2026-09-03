import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execa } from "execa";
import type { DownloadListenerHandle, DownloadSnapshot } from "takanawa-node";

const GODOT_CEF_CONFIG_PATH = "addons/kirie/godot_cef.json";
const GODOT_CEF_RELEASES_URL = "https://github.com/dsh0416/godot-cef/releases/download";
const PROGRESS_BAR_WIDTH = 24;

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

interface GodotCefConfigFile {
  addon_path?: unknown;
  class_name?: unknown;
  sha256?: unknown;
  version?: unknown;
}

interface DownloadFileOptions {
  expectedSha256: string;
  output: DownloadProgressOutput;
  outputPath: string;
  url: string;
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
    const installStat = await fs.lstat(installDir);
    if (installStat.isSymbolicLink() || !installStat.isDirectory()) {
      return {
        installed: true,
        message: `${installDir} is not a regular addon directory`,
        valid: false,
      };
    }
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
    if (extensionStat.isFile()) {
      return {
        installed: true,
        message: `${config.version} at ${installDir}`,
        valid: true,
      };
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    installed: true,
    message: `incomplete addon at ${installDir}; missing ${path.basename(extensionPath)}`,
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

  const config = await readGodotCefConfig(projectDir);
  const current = await checkGodotCef(projectDir);
  if (current.installed && current.valid) {
    console.log(`Godot CEF is already installed: ${current.message}`);
    return;
  }
  if (current.installed) {
    throw new Error(
      `Refusing to replace an unrecognized Godot CEF installation: ${current.message}`,
    );
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
    await fs.rename(stagedAddon, installDir);
  } finally {
    await Promise.all([
      fs.rm(temporaryRoot, { force: true, recursive: true }),
      stagingRoot ? fs.rm(stagingRoot, { force: true, recursive: true }) : Promise.resolve(),
    ]);
  }

  console.log(`Installed Godot CEF ${config.version} at ${installDir}`);
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
          snapshot.lastErrorCode === TakanawaStatus.HashMismatch
            ? `Godot CEF checksum mismatch: expected ${options.expectedSha256}`
            : (snapshot.lastError ?? "Takanawa download failed");
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
    await execa(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $env:KIRIE_GODOT_CEF_ARCHIVE -DestinationPath $env:KIRIE_GODOT_CEF_EXTRACT_DIR -Force",
      ],
      {
        env: {
          ...process.env,
          KIRIE_GODOT_CEF_ARCHIVE: archivePath,
          KIRIE_GODOT_CEF_EXTRACT_DIR: outputDir,
        },
        stdio: "inherit",
      },
    );
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

function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(1)} MiB`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
