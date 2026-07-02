import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

import { loadKirieConfig, type ResolvedKirieConfig } from "./config.ts";

export type DoctorCheckStatus = "fail" | "ok";

export interface DoctorCheckResult {
  message: string;
  name: string;
  status: DoctorCheckStatus;
}

export interface DoctorOptions {
  config?: ResolvedKirieConfig;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fix?: boolean;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

export interface CheckAndroidSdkOptions {
  env?: NodeJS.ProcessEnv;
}

export interface CheckGodotCommandOptions {
  godotArgs: string[];
  godotCommand: string;
  projectDir: string;
  runGodotVersion?: (options: RunGodotVersionOptions) => Promise<string>;
}

export interface CheckGodotExportTemplatesOptions {
  homeDir?: string;
  platform?: NodeJS.Platform;
  version: string;
}

export interface GodotCommandCheckResult {
  check: DoctorCheckResult;
  version?: string;
}

interface RunGodotVersionOptions {
  godotArgs: string[];
  godotCommand: string;
  projectDir: string;
}

interface TemplatePathOptions {
  homeDir: string;
  platform: NodeJS.Platform;
  version: string;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  if (options.fix) {
    // TODO: Implement `kirie doctor --fix` through Godot-owned configuration writes.
    throw new Error("kirie doctor --fix is not implemented yet.");
  }

  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
    }));
  const checks = await runDoctorChecks({
    config,
    env: options.env,
    homeDir: options.homeDir,
    platform: options.platform,
  });

  for (const check of checks) {
    console.log(`${check.status === "ok" ? "OK" : "FAIL"} ${check.name}: ${check.message}`);
  }

  const failures = checks.filter((check) => check.status === "fail");
  if (failures.length > 0) {
    throw new Error(`kirie doctor found ${failures.length} problem(s).`);
  }
}

export async function runDoctorChecks(options: {
  config: ResolvedKirieConfig;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
}): Promise<DoctorCheckResult[]> {
  // TODO: Check Godot EditorSettings for `export/android/java_sdk_path` and
  // verify that it points at a usable Java/JDK before Android export diagnostics pass.
  const godotCommand = await checkGodotCommand({
    godotArgs: options.config.godot.args,
    godotCommand: options.config.godot.command,
    projectDir: options.config.godot.project,
  });
  const exportTemplates = godotCommand.version
    ? await checkGodotExportTemplates({
        homeDir: options.homeDir,
        platform: options.platform,
        version: godotCommand.version,
      })
    : {
        message: "skipped because the Godot version could not be detected",
        name: "Godot export templates",
        status: "fail" as const,
      };

  return [
    godotCommand.check,
    exportTemplates,
    await checkAndroidSdk({
      env: options.env,
    }),
  ];
}

export async function checkGodotCommand(
  options: CheckGodotCommandOptions,
): Promise<GodotCommandCheckResult> {
  try {
    const version = parseGodotVersion(
      await (options.runGodotVersion ?? runGodotVersion)({
        godotArgs: options.godotArgs,
        godotCommand: options.godotCommand,
        projectDir: options.projectDir,
      }),
    );

    return {
      check: {
        message: version,
        name: "Godot command",
        status: "ok",
      },
      version,
    };
  } catch (error) {
    return {
      check: {
        message: `could not run ${options.godotCommand} --version: ${
          error instanceof Error ? error.message : String(error)
        }`,
        name: "Godot command",
        status: "fail",
      },
    };
  }
}

export async function checkGodotExportTemplates(
  options: CheckGodotExportTemplatesOptions,
): Promise<DoctorCheckResult> {
  const templatesDir = resolveGodotExportTemplatesDir({
    homeDir: options.homeDir ?? os.homedir(),
    platform: options.platform ?? process.platform,
    version: options.version,
  });

  let templates: string[];
  try {
    templates = await fs.readdir(templatesDir);
  } catch {
    return {
      message: `missing templates for Godot ${options.version} at ${templatesDir}`,
      name: "Godot export templates",
      status: "fail",
    };
  }

  if (templates.length === 0) {
    return {
      message: `missing templates for Godot ${options.version} at ${templatesDir}`,
      name: "Godot export templates",
      status: "fail",
    };
  }

  return {
    message: templatesDir,
    name: "Godot export templates",
    status: "ok",
  };
}

export async function checkAndroidSdk(
  options: CheckAndroidSdkOptions = {},
): Promise<DoctorCheckResult> {
  const env = options.env ?? process.env;
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!sdk) {
    return {
      message: "set ANDROID_HOME to the Android SDK directory",
      name: "Android SDK",
      status: "fail",
    };
  }

  let sdkStat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    sdkStat = await fs.stat(sdk);
  } catch {
    return {
      message: `${sdk} does not exist or is not a directory`,
      name: "Android SDK",
      status: "fail",
    };
  }

  if (!sdkStat.isDirectory()) {
    return {
      message: `${sdk} does not exist or is not a directory`,
      name: "Android SDK",
      status: "fail",
    };
  }

  return {
    message: `${env.ANDROID_HOME ? "ANDROID_HOME" : "ANDROID_SDK_ROOT"}=${sdk}`,
    name: "Android SDK",
    status: "ok",
  };
}

async function runGodotVersion(options: RunGodotVersionOptions): Promise<string> {
  const result = await execa(options.godotCommand, [...options.godotArgs, "--version"], {
    cwd: options.projectDir,
  });
  return result.stdout;
}

function parseGodotVersion(output: string): string {
  const [version] = output.trim().split(/\s+/, 1);
  if (!version) {
    throw new Error("empty version output");
  }

  return version.replace(/\.official\..*$/, "");
}

function resolveGodotExportTemplatesDir(options: TemplatePathOptions): string {
  if (options.platform === "darwin") {
    return path.join(
      options.homeDir,
      "Library",
      "Application Support",
      "Godot",
      "export_templates",
      options.version,
    );
  }

  if (options.platform === "win32") {
    return path.join(
      options.homeDir,
      "AppData",
      "Roaming",
      "Godot",
      "export_templates",
      options.version,
    );
  }

  return path.join(
    options.homeDir,
    ".local",
    "share",
    "godot",
    "export_templates",
    options.version,
  );
}
