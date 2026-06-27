import path from "node:path";
import { readExportPresetValue } from "@gd-kirie/build";
import { execa } from "execa";

import { loadKirieConfig, type ResolvedKirieConfig } from "./config.ts";
import { resolveExportOutputPath } from "./export.ts";

export interface KirieDevLaunchOptions {
  "kirie-dev": "1";
  "kirie-web-url": string;
}

export type LaunchOptions = KirieDevLaunchOptions | Record<string, string>;

export function createKirieDevLaunchOptions(webUrl: string): KirieDevLaunchOptions {
  return {
    "kirie-dev": "1",
    "kirie-web-url": webUrl,
  };
}

export interface RunAndroidOptions {
  attachLogcat?: boolean;
  clearData?: boolean;
  clearLogcat?: boolean;
  config?: ResolvedKirieConfig;
  cwd?: string;
  device?: string;
  forceStop?: boolean;
  launchOptions?: LaunchOptions;
  packageName?: string;
  preset?: string;
}

export interface ReverseAndroidTcpOptions {
  config?: ResolvedKirieConfig;
  cwd?: string;
  device?: string;
  hostPort?: number;
  port: number;
}

export interface RunIosSimulatorOptions {
  appPath?: string;
  bundleId?: string;
  config?: ResolvedKirieConfig;
  cwd?: string;
  launchOptions?: LaunchOptions;
  simulatorId?: string;
  terminateExisting?: boolean;
}

export async function runAndroid(options: RunAndroidOptions = {}): Promise<void> {
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
    }));
  const adbArgs = options.device ? ["-s", options.device] : [];
  const packageName = options.packageName ?? readAndroidPackageName(config.godot.project, options);

  await execa(
    "adb",
    [
      ...adbArgs,
      "install",
      "-r",
      resolveExportOutputPath({
        configCwd: config.cwd,
        mode: "debug",
        platform: "android",
        preset: options.preset ?? "Android",
      }),
    ],
    {
      cwd: config.cwd,
      stdio: "inherit",
    },
  );

  if (options.clearLogcat) {
    await execa("adb", [...adbArgs, "logcat", "-c"], {
      cwd: config.cwd,
      stdio: "inherit",
    });
  }

  if (options.forceStop) {
    await execa("adb", [...adbArgs, "shell", "am", "force-stop", packageName], {
      cwd: config.cwd,
      reject: false,
      stderr: "ignore",
      stdout: "ignore",
    });
  }

  if (options.clearData) {
    await execa("adb", [...adbArgs, "shell", "pm", "clear", packageName], {
      cwd: config.cwd,
      stderr: "inherit",
      stdout: "ignore",
    });
  }

  await execa(
    "adb",
    [
      ...adbArgs,
      "shell",
      "am",
      "start",
      "-n",
      `${packageName}/com.godot.game.GodotAppLauncher`,
      ...androidLaunchOptionArgs(options.launchOptions),
    ],
    {
      cwd: config.cwd,
      stderr: "inherit",
      stdout: "ignore",
    },
  );

  if (options.attachLogcat === false) {
    return;
  }

  const pid = await waitForAndroidPackagePid({
    adbArgs,
    cwd: config.cwd,
    packageName,
  });
  await attachAndroidLogcat({
    adbArgs,
    cwd: config.cwd,
    packageName,
    pid,
  });
}

export async function reverseAndroidTcp(options: ReverseAndroidTcpOptions): Promise<void> {
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
    }));
  const adbArgs = options.device ? ["-s", options.device] : [];
  const hostPort = options.hostPort ?? options.port;

  await execa("adb", [...adbArgs, "reverse", `tcp:${options.port}`, `tcp:${hostPort}`], {
    cwd: config.cwd,
    stdio: "inherit",
  });
}

export async function runIosSimulator(options: RunIosSimulatorOptions = {}): Promise<void> {
  // TODO: Add a separate physical-device path. Capacitor's CLI uses the
  // selected iOS target for xcodebuild, then deploys the built app with
  // native-run instead of routing physical devices through simctl.
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
    }));
  const simulatorId = options.simulatorId ?? process.env.SIMULATOR_ID ?? "booted";
  const bundleId =
    options.bundleId ??
    (options.appPath
      ? await readIosAppBundleId(path.resolve(config.cwd, options.appPath))
      : readIosBundleId(config.godot.project));

  if (options.terminateExisting) {
    await execa("xcrun", ["simctl", "terminate", simulatorId, bundleId], {
      cwd: config.cwd,
      reject: false,
      stderr: "ignore",
      stdout: "ignore",
    });
  }

  if (options.appPath) {
    await execa(
      "xcrun",
      ["simctl", "install", simulatorId, path.resolve(config.cwd, options.appPath)],
      {
        cwd: config.cwd,
        stdio: "inherit",
      },
    );
    await waitForIosSimulatorAppInstall({
      bundleId,
      cwd: config.cwd,
      simulatorId,
    });
  }

  await execa(
    "xcrun",
    [
      "simctl",
      "launch",
      "--console",
      simulatorId,
      bundleId,
      ...iosLaunchOptionArgs(options.launchOptions),
    ],
    {
      cwd: config.cwd,
      stdio: "inherit",
    },
  );
}

function readAndroidPackageName(
  projectDir: string,
  options: Pick<RunAndroidOptions, "preset">,
): string {
  const packageName = readExportPresetValue({
    optionName: "package/unique_name",
    presetName: options.preset ?? "Android",
    projectDir,
  });

  if (typeof packageName === "string") {
    return packageName;
  }

  throw new Error("Android export preset option package/unique_name must be a string.");
}

function readIosBundleId(projectDir: string): string {
  const bundleId = readExportPresetValue({
    optionName: "application/bundle_identifier",
    presetName: "iOS",
    projectDir,
  });

  if (typeof bundleId === "string") {
    return bundleId;
  }

  throw new Error("iOS export preset option application/bundle_identifier must be a string.");
}

function androidLaunchOptionArgs(launchOptions: LaunchOptions | undefined): string[] {
  if (!launchOptions) {
    return [];
  }

  return Object.entries(launchOptions).flatMap(([key, value]) => ["--es", key, value]);
}

async function attachAndroidLogcat(options: {
  adbArgs: string[];
  cwd: string;
  packageName: string;
  pid: string;
}): Promise<void> {
  const args = [...options.adbArgs, "logcat", "-v", "time", `--pid=${options.pid}`];
  const logcat = execa("adb", args, {
    cwd: options.cwd,
    reject: false,
    stderr: "inherit",
    stdout: "pipe",
  });

  if (!logcat.stdout) {
    throw new Error("adb logcat did not expose stdout");
  }

  logcat.stdout.on("data", (chunk: Buffer | string) => {
    process.stdout.write(chunk);
  });

  let cleanupPromise: Promise<void> | undefined;
  let interruptedSignal: NodeJS.Signals | undefined;
  const cleanupAndroidRun = (signal: NodeJS.Signals): Promise<void> => {
    interruptedSignal = signal;
    logcat.kill("SIGTERM");

    cleanupPromise ??= execa(
      "adb",
      [...options.adbArgs, "shell", "am", "force-stop", options.packageName],
      {
        cwd: options.cwd,
        reject: false,
        stderr: "inherit",
        stdout: "ignore",
      },
    ).then(() => {});

    return cleanupPromise;
  };
  const handleInterrupt = (signal: NodeJS.Signals) => {
    cleanupAndroidRun(signal).then(() => {
      process.exitCode = signal === "SIGINT" ? 130 : 143;
    });
  };

  process.once("SIGINT", handleInterrupt);
  process.once("SIGTERM", handleInterrupt);

  const result = await logcat;
  process.off("SIGINT", handleInterrupt);
  process.off("SIGTERM", handleInterrupt);

  if (cleanupPromise) {
    await cleanupPromise;
  }
  if (interruptedSignal) {
    process.exitCode = interruptedSignal === "SIGINT" ? 130 : 143;
    return;
  }

  if (result.failed && result.signal !== "SIGTERM" && result.exitCode !== 143) {
    throw new Error(
      result.signal
        ? `adb logcat exited with signal ${result.signal}`
        : `adb logcat exited with code ${result.exitCode ?? "unknown"}`,
    );
  }
}

async function waitForAndroidPackagePid(options: {
  adbArgs: string[];
  cwd: string;
  packageName: string;
  timeoutMs?: number;
}): Promise<string> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const result = await execa("adb", [...options.adbArgs, "shell", "pidof", options.packageName], {
      cwd: options.cwd,
      reject: false,
      stderr: "ignore",
    });
    const pid = result.stdout.trim().split(/\s+/).find(Boolean);

    if (pid) {
      return pid;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(`Timed out waiting for Android package PID: ${options.packageName}`);
}

// TODO: Replace command-specific polling loops with a shared helper that accepts
// the command, success predicate, timeout, and polling interval.
async function waitForIosSimulatorAppInstall(options: {
  bundleId: string;
  cwd: string;
  simulatorId: string;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);

  while (Date.now() < deadline) {
    const result = await execa(
      "xcrun",
      ["simctl", "get_app_container", options.simulatorId, options.bundleId, "app"],
      {
        cwd: options.cwd,
        reject: false,
        stderr: "ignore",
        stdout: "ignore",
      },
    );
    if (result.exitCode === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for iOS app install: ${options.bundleId}`);
}

function iosLaunchOptionArgs(launchOptions: LaunchOptions | undefined): string[] {
  if (!launchOptions) {
    return [];
  }

  return Object.entries(launchOptions).map(
    ([key, value]) => `--${key.replaceAll("_", "-")}=${value}`,
  );
}

async function readIosAppBundleId(appPath: string): Promise<string> {
  const result = await execa("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleIdentifier",
    path.join(appPath, "Info.plist"),
  ]);

  return result.stdout.trim();
}
