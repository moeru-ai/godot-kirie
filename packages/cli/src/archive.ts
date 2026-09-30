import type { DownloadListenerHandle, DownloadSnapshot } from "takanawa-node";
import path from "node:path";
import { execa } from "execa";

const PROGRESS_BAR_WIDTH = 24;

export interface DownloadProgressOutput {
  columns?: number;
  isTTY?: boolean;
  write: (text: string) => unknown;
}

export interface DownloadFileOptions {
  expectedSha256: string;
  output: DownloadProgressOutput;
  outputPath: string;
  url: string;
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

export async function downloadFile(options: DownloadFileOptions): Promise<void> {
  // Load the native addon only when a command downloads an archive.
  const { DownloadTask, TakanawaError, TakanawaStatus } = await import("takanawa-node");
  const task = new DownloadTask({
    hash: { expected: options.expectedSha256, kind: "sha256" },
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
            `Archive checksum mismatch: expected ${options.expectedSha256}` :
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

export async function extractZip(archivePath: string, outputDir: string): Promise<void> {
  if (process.platform === "win32") {
    const tarExecutable = path.join(process.env.SystemRoot!, "System32", "tar.exe");
    await execa(tarExecutable, ["-xf", archivePath, "-C", outputDir], { stdio: "inherit" });
    return;
  }

  await execa("unzip", ["-q", archivePath, "-d", outputDir], { stdio: "inherit" });
}

function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(1)} MiB`;
}
