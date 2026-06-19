import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";

export const rootDir = process.cwd();
export const scriptsDir = path.join(rootDir, "scripts");
export const distDir = "dist";
export const integrationProjectDir = "tests/integration";
export const integrationDistDir = "dist/integration";
export const godotSourceRoot = path.join(rootDir, "godot");

interface AndroidDebugExportOptions {
  projectDir: string;
  userArgs?: string[];
}

export async function buildWebPackage(filter: string): Promise<void> {
  await execa("corepack", ["pnpm", "-F", filter, "run", "build"], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

export async function runKirieCli(args: string[]): Promise<void> {
  await execa(process.execPath, kirieCliArgs(args), {
    cwd: rootDir,
    stdio: "inherit",
  });
}

export function kirieCliArgs(args: string[]): string[] {
  return [path.join(rootDir, "packages/cli/src/cli.ts"), ...args];
}

export async function exportAndroidDebug(options: AndroidDebugExportOptions): Promise<void> {
  const args = ["export", "android", "--project", path.resolve(rootDir, options.projectDir)];

  if (options.userArgs && options.userArgs.length > 0) {
    args.push("--", ...options.userArgs);
  }

  await runKirieCli(args);
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
  await runKirieCli([
    "export",
    "ios",
    "--project",
    path.resolve(rootDir, projectDir),
    "--output",
    path.resolve(rootDir, `${xcodeExportDir}/${exportName}.xcodeproj`),
  ]);

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
