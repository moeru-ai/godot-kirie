import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

import { loadKirieConfig, type ResolvedKirieConfig } from "./config.ts";
import { runExport } from "./export.ts";

export interface ExportIosSimulatorAppOptions {
  appPath: string;
  build?: boolean;
  config?: ResolvedKirieConfig;
  cwd?: string;
  godotCommand?: string;
  mode?: string;
  xcodeProjectPath?: string;
}

export async function exportIosSimulatorApp(options: ExportIosSimulatorAppOptions): Promise<void> {
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
      mode: options.mode,
    }));
  const appPath = path.resolve(config.cwd, options.appPath);
  const xcodeProjectPath = path.resolve(
    config.cwd,
    options.xcodeProjectPath ?? defaultIosSimulatorXcodeProjectPath(config.godot.project, appPath),
  );
  const rawBuildDir = defaultIosSimulatorRawBuildDir(appPath);

  validateIosSimulatorAppOutputPath({
    appPath,
    projectDir: config.godot.project,
    rawBuildDir,
    xcodeProjectPath,
  });

  await runExport({
    build: options.build,
    config,
    cwd: config.cwd,
    godotCommand: options.godotCommand,
    mode: options.mode,
    output: xcodeProjectPath,
    platform: "ios",
  });
  await buildExportedIosSimulatorApp({
    appPath,
    cwd: config.cwd,
    projectDir: config.godot.project,
    rawBuildDir,
    xcodeProjectPath,
  });
}

function defaultIosSimulatorXcodeProjectPath(projectDir: string, appPath: string): string {
  return path.join(path.dirname(appPath), "ios_xcode", `${path.basename(projectDir)}.xcodeproj`);
}

function defaultIosSimulatorRawBuildDir(appPath: string): string {
  return path.join(path.dirname(appPath), "ios_raw_build");
}

async function buildExportedIosSimulatorApp(options: {
  appPath: string;
  cwd: string;
  projectDir: string;
  rawBuildDir: string;
  xcodeProjectPath: string;
}): Promise<void> {
  const scheme = path.basename(options.projectDir);
  const rawAppPath = path.join(options.rawBuildDir, `${scheme}.app`);

  fs.mkdirSync(path.dirname(options.appPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.xcodeProjectPath), { recursive: true });
  fs.mkdirSync(options.rawBuildDir, { recursive: true });

  const simulatorLibgodot = findSimulatorLibgodot(path.dirname(options.xcodeProjectPath));
  if (!simulatorLibgodot) {
    throw new Error(
      `Could not find exported simulator libgodot.a in ${path.dirname(options.xcodeProjectPath)}`,
    );
  }

  const arm64Source = await ensureIosArm64SimulatorLibgodot();
  fs.copyFileSync(arm64Source, simulatorLibgodot);

  await execa(
    "xcodebuild",
    [
      "-project",
      options.xcodeProjectPath,
      "-scheme",
      scheme,
      "-sdk",
      "iphonesimulator",
      "-destination",
      "generic/platform=iOS Simulator",
      "-configuration",
      "Debug",
      `CONFIGURATION_BUILD_DIR=${options.rawBuildDir}`,
      "CODE_SIGNING_ALLOWED=NO",
      "CODE_SIGNING_REQUIRED=NO",
      "CODE_SIGN_IDENTITY=",
      "ARCHS=arm64",
      "EXCLUDED_ARCHS=x86_64",
      "ONLY_ACTIVE_ARCH=YES",
      "build",
    ],
    {
      cwd: options.cwd,
      stdio: "inherit",
    },
  );

  fs.rmSync(options.appPath, { force: true, recursive: true });
  fs.renameSync(rawAppPath, options.appPath);
  fs.rmSync(options.rawBuildDir, { force: true, recursive: true });
}

function findSimulatorLibgodot(dirPath: string): string | undefined {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const found = findSimulatorLibgodot(entryPath);
      if (found) {
        return found;
      }

      continue;
    }

    if (entry.name === "libgodot.a" && entryPath.includes("simulator")) {
      return entryPath;
    }
  }

  return undefined;
}

async function ensureIosArm64SimulatorLibgodot(): Promise<string> {
  const arm64Source = path.join(
    resolveRepositoryGodotSourceRoot(),
    "bin/libgodot.ios.template_debug.arm64.simulator.a",
  );

  if (fs.existsSync(arm64Source)) {
    return arm64Source;
  }

  await execa(
    "scons",
    [
      "platform=ios",
      "target=template_debug",
      "arch=arm64",
      "simulator=yes",
      `-j${os.availableParallelism()}`,
    ],
    {
      cwd: resolveRepositoryGodotSourceRoot(),
      stdio: "inherit",
    },
  );

  return arm64Source;
}

function resolveRepositoryGodotSourceRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../godot");
}

function validateIosSimulatorAppOutputPath(options: {
  appPath: string;
  projectDir: string;
  rawBuildDir: string;
  xcodeProjectPath: string;
}): void {
  const appPath = path.resolve(options.appPath);
  const projectDir = path.resolve(options.projectDir);
  const rawBuildDir = path.resolve(options.rawBuildDir);
  const xcodeProjectDir = path.dirname(path.resolve(options.xcodeProjectPath));

  if (path.extname(appPath) !== ".app") {
    throw new Error(`iOS simulator app output path must end with .app: ${appPath}`);
  }

  if (appPath === projectDir) {
    throw new Error(`iOS simulator app output path must not be the Godot project root: ${appPath}`);
  }

  const rawRelative = path.relative(rawBuildDir, appPath);
  if (rawRelative === "" || (!rawRelative.startsWith("..") && !path.isAbsolute(rawRelative))) {
    throw new Error(`iOS simulator app output path must not be inside raw build dir: ${appPath}`);
  }

  const xcodeRelative = path.relative(xcodeProjectDir, appPath);
  if (
    xcodeRelative === "" ||
    (!xcodeRelative.startsWith("..") && !path.isAbsolute(xcodeRelative))
  ) {
    throw new Error(
      `iOS simulator app output path must not be inside Xcode export dir: ${appPath}`,
    );
  }

  const rawParentRelative = path.relative(appPath, rawBuildDir);
  if (
    rawParentRelative === "" ||
    (!rawParentRelative.startsWith("..") && !path.isAbsolute(rawParentRelative))
  ) {
    throw new Error(`iOS simulator raw build dir must not be inside app output path: ${appPath}`);
  }

  const xcodeParentRelative = path.relative(appPath, xcodeProjectDir);
  if (
    xcodeParentRelative === "" ||
    (!xcodeParentRelative.startsWith("..") && !path.isAbsolute(xcodeParentRelative))
  ) {
    throw new Error(
      `iOS simulator Xcode export dir must not be inside app output path: ${appPath}`,
    );
  }
}
