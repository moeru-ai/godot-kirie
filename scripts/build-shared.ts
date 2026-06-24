import path from "node:path";
import process from "node:process";
import { execa } from "execa";
import { exportIosSimulatorApp as exportCliIosSimulatorApp } from "../packages/cli/src/ios.ts";

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

export async function exportIosSimulatorApp(projectDir: string, appPath: string): Promise<void> {
  const exportName = path.basename(projectDir);
  const xcodeExportDir = `${path.dirname(appPath)}/ios_xcode`;

  await exportCliIosSimulatorApp({
    appPath: path.resolve(rootDir, appPath),
    cwd: path.resolve(rootDir, projectDir),
    xcodeProjectPath: path.resolve(rootDir, `${xcodeExportDir}/${exportName}.xcodeproj`),
  });
  console.log(`Successfully built: ${appPath}`);
}
