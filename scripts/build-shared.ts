import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";
import { parse as parseIni } from "ini";

export const rootDir = process.cwd();
export const distDir = "dist";
export const integrationProjectDir = "tests/integration";
export const integrationDistDir = "dist/integration";
export const godotSourceRoot = path.join(rootDir, "godot");

interface AndroidDebugExportOptions {
  apkPath: string;
  projectDir: string;
  userArgs?: string[];
}

export function readExportPresetOption(
  projectDir: string,
  presetName: "Android" | "iOS",
  optionName: string,
): string {
  const exportPresetsPath = `${projectDir}/export_presets.cfg`;
  const config = parseIni(fs.readFileSync(exportPresetsPath, "utf8")) as {
    preset: Record<string, { name: string; options: Record<string, string> }>;
  };

  for (const preset of Object.values(config.preset)) {
    if (preset.name !== presetName) {
      continue;
    }

    return preset.options[optionName];
  }

  throw new Error(`Export preset not found: ${presetName} in ${exportPresetsPath}`);
}

export async function buildWebPackage(filter: string): Promise<void> {
  await execa("corepack", ["pnpm", "--filter", filter, "run", "build"], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

export async function exportAndroidDebug(options: AndroidDebugExportOptions): Promise<void> {
  fs.mkdirSync(path.dirname(options.apkPath), { recursive: true });

  const godotArgs = [
    "x",
    "--",
    "godot",
    "--headless",
    "--path",
    options.projectDir,
    "--install-android-build-template",
    "--export-debug",
    "Android",
    `../../${options.apkPath}`,
  ];

  if (options.userArgs && options.userArgs.length > 0) {
    godotArgs.push("--", ...options.userArgs);
  }

  await execa("mise", godotArgs, {
    cwd: rootDir,
    stdio: "inherit",
  });
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
    godotSourceRoot,
    "bin/libgodot.ios.template_debug.arm64.simulator.a",
  );

  if (fs.existsSync(arm64Source)) {
    console.log(`Using existing Godot iOS arm64 simulator template: ${arm64Source}`);
    return arm64Source;
  }

  console.log("Building Godot iOS arm64 simulator template...");
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
      cwd: godotSourceRoot,
      stdio: "inherit",
    },
  );

  return arm64Source;
}

export async function exportIosSimulatorApp(projectDir: string, appPath: string): Promise<void> {
  const exportName = path.basename(projectDir);
  const xcodeExportDir = `${path.dirname(appPath)}/ios_xcode`;
  const rawBuildDir = `${path.dirname(appPath)}/ios_raw_build`;
  const rawBuildDirPath = path.resolve(rootDir, rawBuildDir);
  const appPathAbsolute = path.resolve(rootDir, appPath);

  fs.mkdirSync(path.dirname(appPath), { recursive: true });
  fs.mkdirSync(xcodeExportDir, { recursive: true });

  console.log("Exporting Xcode project...");
  await execa(
    "mise",
    [
      "x",
      "--",
      "godot",
      "--headless",
      "--path",
      projectDir,
      "--export-debug",
      "iOS",
      `../../${xcodeExportDir}/${exportName}.xcodeproj`,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  const simulatorLibgodot = findSimulatorLibgodot(xcodeExportDir);
  if (!simulatorLibgodot) {
    throw new Error(`Could not find exported simulator libgodot.a in ${xcodeExportDir}`);
  }

  // Godot's iOS simulator export template can advertise arm64 support while
  // shipping an x86_64-only libgodot.a, which fails Apple Silicon simulator
  // links with "_main" undefined. See godotengine/godot#62929.
  const arm64Source = await ensureIosArm64SimulatorLibgodot();
  console.log("Replacing exported simulator libgodot with the arm64 simulator template...");
  fs.copyFileSync(arm64Source, simulatorLibgodot);

  console.log("Building final .app bundle...");
  await execa(
    "mise",
    [
      "x",
      "--",
      "xcodebuild",
      "-project",
      `${xcodeExportDir}/${exportName}.xcodeproj`,
      "-scheme",
      exportName,
      "-sdk",
      "iphonesimulator",
      "-destination",
      "generic/platform=iOS Simulator",
      "-configuration",
      "Debug",
      `CONFIGURATION_BUILD_DIR=${rawBuildDirPath}`,
      "CODE_SIGNING_ALLOWED=NO",
      "CODE_SIGNING_REQUIRED=NO",
      "CODE_SIGN_IDENTITY=",
      "ARCHS=arm64",
      "EXCLUDED_ARCHS=x86_64",
      "ONLY_ACTIVE_ARCH=YES",
      "build",
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  const rawApp = path.join(rawBuildDirPath, `${exportName}.app`);
  console.log(`Moving ${rawApp} -> ${appPathAbsolute}`);
  fs.rmSync(appPathAbsolute, { force: true, recursive: true });
  fs.renameSync(rawApp, appPathAbsolute);
  fs.rmSync(rawBuildDir, { force: true, recursive: true });
  console.log(`Successfully built: ${appPath}`);
}
