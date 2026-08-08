import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

import { loadKirieConfig, type ResolvedKirieConfig } from "./config.ts";
import { runExport } from "./export.ts";

export interface ExportIosAppOptions {
  appPath: string;
  build?: boolean;
  config?: ResolvedKirieConfig;
  cwd?: string;
  godotCommand?: string;
  mode?: string;
  preset?: string;
  release?: boolean;
  device?: string;
  target: "device" | "simulator";
  xcodeProjectPath?: string;
}

export async function exportIosApp(options: ExportIosAppOptions): Promise<void> {
  const config =
    options.config ??
    (await loadKirieConfig({
      command: "build",
      cwd: options.cwd,
      mode: options.mode,
    }));
  const appPath = path.resolve(config.cwd, options.appPath);
  const generatedXcodeProjectDir = options.xcodeProjectPath
    ? undefined
    : fs.mkdtempSync(path.join(os.tmpdir(), "kirie-ios-export-"));
  const xcodeProjectPath = path.resolve(
    config.cwd,
    options.xcodeProjectPath ??
      defaultIosXcodeProjectPath(config.godot.project, generatedXcodeProjectDir),
  );
  const rawBuildDir = defaultIosRawBuildDir(appPath, options.target);

  validateIosAppOutputPath(appPath, options.target, config.godot.project);

  fs.rmSync(appPath, { force: true, recursive: true });

  try {
    await runExport({
      build: options.build,
      config,
      cwd: config.cwd,
      godotCommand: options.godotCommand,
      mode: options.mode,
      output: xcodeProjectPath,
      platform: "ios",
      preset: options.preset,
      release: options.release,
    });
    await buildExportedIosApp({
      appPath,
      cwd: config.cwd,
      device: options.device,
      projectDir: config.godot.project,
      rawBuildDir,
      release: options.release,
      target: options.target,
      xcodeProjectPath,
    });
  } finally {
    if (generatedXcodeProjectDir) {
      fs.rmSync(generatedXcodeProjectDir, { force: true, recursive: true });
    }
  }
}

function defaultIosXcodeProjectPath(projectDir: string, projectRoot: string | undefined): string {
  return path.join(projectRoot ?? os.tmpdir(), `${path.basename(projectDir)}.xcodeproj`);
}

function defaultIosRawBuildDir(appPath: string, target: ExportIosAppOptions["target"]): string {
  return path.join(
    path.dirname(appPath),
    target === "device" ? "ios_device_raw_build" : "ios_raw_build",
  );
}

async function buildExportedIosApp(options: {
  appPath: string;
  cwd: string;
  device?: string;
  projectDir: string;
  rawBuildDir: string;
  release?: boolean;
  target: ExportIosAppOptions["target"];
  xcodeProjectPath: string;
}): Promise<void> {
  const scheme = path.basename(options.projectDir);
  const rawAppPath = path.join(options.rawBuildDir, `${scheme}.app`);
  const simulator = options.target === "simulator";

  fs.mkdirSync(path.dirname(options.appPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.xcodeProjectPath), { recursive: true });
  fs.rmSync(options.rawBuildDir, { force: true, recursive: true });
  fs.mkdirSync(options.rawBuildDir, { recursive: true });

  if (simulator) {
    const simulatorLibgodot = findSimulatorLibgodot(path.dirname(options.xcodeProjectPath));
    if (!simulatorLibgodot) {
      throw new Error(
        `Could not find exported simulator libgodot.a in ${path.dirname(options.xcodeProjectPath)}`,
      );
    }

    fs.copyFileSync(
      await ensureIosArm64SimulatorLibgodot(options.release ?? false),
      simulatorLibgodot,
    );
  }

  await execa(
    "xcodebuild",
    [
      "-project",
      options.xcodeProjectPath,
      "-scheme",
      scheme,
      "-sdk",
      simulator ? "iphonesimulator" : "iphoneos",
      "-destination",
      simulator
        ? "generic/platform=iOS Simulator"
        : options.device
          ? `id=${options.device}`
          : "generic/platform=iOS",
      "-configuration",
      options.release ? "Release" : "Debug",
      `CONFIGURATION_BUILD_DIR=${options.rawBuildDir}`,
      "ARCHS=arm64",
      ...(simulator
        ? [
            "CODE_SIGNING_ALLOWED=NO",
            "CODE_SIGNING_REQUIRED=NO",
            "CODE_SIGN_IDENTITY=",
            "EXCLUDED_ARCHS=x86_64",
          ]
        : ["-allowProvisioningUpdates"]),
      "ONLY_ACTIVE_ARCH=YES",
      "build",
    ],
    {
      cwd: options.cwd,
      stdio: "inherit",
    },
  );

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

async function ensureIosArm64SimulatorLibgodot(release: boolean): Promise<string> {
  const target = release ? "release" : "debug";
  const arm64Source = path.join(
    resolveRepositoryGodotSourceRoot(),
    `bin/libgodot.ios.template_${target}.arm64.simulator.a`,
  );

  if (fs.existsSync(arm64Source)) {
    return arm64Source;
  }

  await execa(
    "scons",
    [
      "platform=ios",
      `target=template_${target}`,
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

function validateIosAppOutputPath(
  appPath: string,
  target: ExportIosAppOptions["target"],
  projectDir: string,
): void {
  const resolvedAppPath = path.resolve(appPath);

  if (path.extname(resolvedAppPath) !== ".app") {
    throw new Error(`iOS ${target} app output path must end with .app: ${resolvedAppPath}`);
  }

  if (resolvedAppPath === path.resolve(projectDir)) {
    throw new Error(
      `iOS ${target} app output path must not be the Godot project root: ${resolvedAppPath}`,
    );
  }
}
