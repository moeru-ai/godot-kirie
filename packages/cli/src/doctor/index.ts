import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

import { loadKirieConfig, type ResolvedKirieConfig } from "../config.ts";
import { checkGodotCef, installGodotCef } from "./godot-cef.ts";

export const DoctorCheckStatus = {
  Fail: "fail",
  Ok: "ok",
  Warn: "warn",
} as const;
export type DoctorCheckStatus = (typeof DoctorCheckStatus)[keyof typeof DoctorCheckStatus];

export const DoctorTarget = {
  GodotCef: "godot-cef",
} as const;
export type DoctorTarget = (typeof DoctorTarget)[keyof typeof DoctorTarget];

export interface DoctorCheckResult {
  error?: Error;
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
  target?: DoctorTarget;
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
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
    }));

  if (options.fix) {
    await installGodotCef({ projectDir: config.godot.project });
  }

  const checks = options.target
    ? [await checkGodotCefPrerequisite(config.godot.project)]
    : await runDoctorChecks({
        config,
        env: options.env,
        homeDir: options.homeDir,
        platform: options.platform,
      });

  for (const check of checks) {
    console.log(`${check.status} ${check.name}: ${check.message}`);
  }

  const failures = checks.filter((check) => check.status === DoctorCheckStatus.Fail);
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.error ?? new Error(`${failure.name}: ${failure.message}`)),
      `kirie doctor found ${failures.length} problem(s).`,
    );
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
        status: DoctorCheckStatus.Fail,
      };

  return [
    godotCommand.check,
    exportTemplates,
    await checkAndroidSdk(options.env),
    await checkGodotCefPrerequisite(options.config.godot.project),
  ];
}

export async function checkGodotCefPrerequisite(projectDir: string): Promise<DoctorCheckResult> {
  try {
    const result = await checkGodotCef(projectDir);
    if (!result.valid) {
      return {
        message: result.message,
        name: "Godot CEF",
        status: DoctorCheckStatus.Fail,
      };
    }
    return {
      message: result.installed
        ? result.message
        : `${result.message} (run: pnpm kirie doctor --fix godot-cef)`,
      name: "Godot CEF",
      status: result.installed ? DoctorCheckStatus.Ok : DoctorCheckStatus.Warn,
    };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error), { cause: error });
    return {
      error: failure,
      message: failure.message,
      name: "Godot CEF",
      status: DoctorCheckStatus.Fail,
    };
  }
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
        status: DoctorCheckStatus.Ok,
      },
      version,
    };
  } catch (error) {
    const failure = new Error(
      `could not run ${options.godotCommand} --version: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
    return {
      check: {
        error: failure,
        message: failure.message,
        name: "Godot command",
        status: DoctorCheckStatus.Fail,
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
  const missingMessage = `missing templates for Godot ${options.version} at ${templatesDir}`;

  let templates: string[];
  try {
    templates = await fs.readdir(templatesDir);
  } catch (error) {
    return {
      error: new Error(missingMessage, { cause: error }),
      message: missingMessage,
      name: "Godot export templates",
      status: DoctorCheckStatus.Fail,
    };
  }

  if (templates.length === 0) {
    return {
      message: missingMessage,
      name: "Godot export templates",
      status: DoctorCheckStatus.Fail,
    };
  }

  return {
    message: templatesDir,
    name: "Godot export templates",
    status: DoctorCheckStatus.Ok,
  };
}

export async function checkAndroidSdk(
  env: NodeJS.ProcessEnv = process.env,
): Promise<DoctorCheckResult> {
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!sdk) {
    return {
      message: "set ANDROID_HOME to the Android SDK directory",
      name: "Android SDK",
      status: DoctorCheckStatus.Fail,
    };
  }
  const invalidSdkMessage = `${sdk} does not exist or is not a directory`;

  let sdkStat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    sdkStat = await fs.stat(sdk);
  } catch (error) {
    return {
      error: new Error(invalidSdkMessage, { cause: error }),
      message: invalidSdkMessage,
      name: "Android SDK",
      status: DoctorCheckStatus.Fail,
    };
  }

  if (!sdkStat.isDirectory()) {
    return {
      message: invalidSdkMessage,
      name: "Android SDK",
      status: DoctorCheckStatus.Fail,
    };
  }

  return {
    message: `${env.ANDROID_HOME ? "ANDROID_HOME" : "ANDROID_SDK_ROOT"}=${sdk}`,
    name: "Android SDK",
    status: DoctorCheckStatus.Ok,
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
