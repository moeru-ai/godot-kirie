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
  skipInstall?: boolean;
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

export interface RunIosDeviceOptions {
  appPath?: string;
  bundleId?: string;
  config?: ResolvedKirieConfig;
  cwd?: string;
  device?: string;
  launchOptions?: LaunchOptions;
  terminateExisting?: boolean;
}

export type RunIosOptions = RunIosSimulatorOptions & RunIosDeviceOptions;

export async function runAndroid(options: RunAndroidOptions = {}): Promise<void> {
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
    }));
  const adbArgs = options.device ? ["-s", options.device] : [];
  const packageName =
    options.packageName ?? readAndroidPackageName(config.godot.project, options.preset);

  if (!options.skipInstall) {
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
  }

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

  const launch = await execa(
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
    },
  );
  if (launch.stdout) {
    console.log(launch.stdout);
  }

  if (options.attachLogcat === false) {
    return;
  }

  const pid = await waitForAndroidPackagePid({
    adbArgs,
    cwd: config.cwd,
    launchOutput: launch.stdout,
    packageName,
  });
  await attachAndroidLogcat({
    adbArgs,
    cwd: config.cwd,
    packageName,
    pid,
  });
}

export async function runIosSimulator(options: RunIosSimulatorOptions = {}): Promise<void> {
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

  const launchArgs = [
    "simctl",
    "launch",
    "--console",
    simulatorId,
    bundleId,
    ...iosLaunchOptionArgs(options.launchOptions),
  ];
  const launchDeadline = Date.now() + 20_000;

  while (true) {
    const launch = execa("xcrun", launchArgs, {
      buffer: { stdout: false, stderr: true },
      cwd: config.cwd,
    });
    launch.stdout?.pipe(process.stdout, { end: false });
    launch.stderr?.pipe(process.stderr, { end: false });

    try {
      await launch;
      return;
    } catch (error) {
      const simulatorNotReady =
        error instanceof Error &&
        /\bBusy\b.*\binstalling or uninstalling\b|\bNotFound\b.*\bunknown to FrontBoard\b/s.test(
          error.message,
        );
      if (!simulatorNotReady || Date.now() >= launchDeadline) {
        throw error;
      }

      console.error(`iOS simulator is not ready to launch ${bundleId}; retrying in 500ms`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export async function runIos(options: RunIosOptions = {}): Promise<void> {
  if (!options.device || (await isIosSimulatorDevice(options.device, options.cwd))) {
    return runIosSimulator({
      appPath: options.appPath,
      bundleId: options.bundleId,
      config: options.config,
      cwd: options.cwd,
      launchOptions: options.launchOptions,
      simulatorId: options.device,
      terminateExisting: options.terminateExisting,
    });
  }

  return runIosDevice(options);
}

export async function runIosDevice(options: RunIosDeviceOptions = {}): Promise<void> {
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
    }));
  const device = options.device ?? process.env.IOS_DEVICE_ID;

  if (!device) {
    throw new Error("iOS physical-device runs require --device <UDID>.");
  }

  const bundleId =
    options.bundleId ??
    (options.appPath
      ? await readIosAppBundleId(path.resolve(config.cwd, options.appPath))
      : readIosBundleId(config.godot.project));

  if (options.appPath) {
    await execa(
      "xcrun",
      [
        "devicectl",
        "device",
        "install",
        "app",
        "--device",
        device,
        path.resolve(config.cwd, options.appPath),
      ],
      {
        cwd: config.cwd,
        stdio: "inherit",
      },
    );
  }

  const launchArgs = ["devicectl", "device", "process", "launch", "--device", device];
  if (options.terminateExisting) {
    launchArgs.push("--terminate-existing");
  }
  launchArgs.push("--console", bundleId, ...iosLaunchOptionArgs(options.launchOptions));

  await execa("xcrun", launchArgs, {
    cwd: config.cwd,
    stdio: "inherit",
  });
}

export async function isIosSimulatorDevice(device: string, cwd?: string): Promise<boolean> {
  if (device === "booted") {
    return true;
  }

  const result = await execa("xcrun", ["simctl", "list", "devices", "--json"], {
    cwd,
    reject: false,
    stderr: "ignore",
  });
  if (result.exitCode !== 0) {
    return false;
  }

  try {
    const devices = JSON.parse(result.stdout) as {
      devices?: Record<string, Array<{ udid?: string }>>;
    };
    return Object.values(devices.devices ?? {}).some((runtimeDevices) =>
      runtimeDevices.some((simulator) => simulator.udid === device),
    );
  } catch {
    return false;
  }
}

function readAndroidPackageName(projectDir: string, preset = "Android"): string {
  const packageName = readExportPresetValue({
    optionName: "package/unique_name",
    presetName: preset,
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
  launchOutput: string;
  packageName: string;
  timeoutMs?: number;
}): Promise<string> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);

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

  const logcat = await execa(
    "adb",
    [
      ...options.adbArgs,
      "logcat",
      "-d",
      "-t",
      "120",
      "-v",
      "time",
      "ActivityManager:I",
      "ActivityTaskManager:I",
      "AndroidRuntime:E",
      "DEBUG:E",
      "Godot:E",
      "*:S",
    ],
    { cwd: options.cwd, reject: false },
  );
  const startupLog = logcat.exitCode === 0 ? logcat.stdout : logcat.stderr;
  throw new Error(
    `Timed out waiting for Android package PID: ${options.packageName}\n` +
      `am start: ${options.launchOutput || "(no output)"}\n` +
      `Android startup logcat:\n${startupLog || "(no output)"}`,
  );
}

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
