import process from "node:process";
import { execa } from "execa";
import { buildAndroidAar, buildIosXcframework } from "./build-kirie.ts";
import {
  buildWebPackage,
  distDir,
  exportAndroidDebug,
  exportIosSimulatorApp,
  readExportPresetOption,
  rootDir,
} from "./build-shared.ts";

function exampleDistDir(exampleName: string): string {
  return `${distDir}/examples/${exampleName}`;
}

async function runExampleAndroid(exampleName: string, projectDir: string): Promise<void> {
  const apkPath = `${exampleDistDir(exampleName)}/android_debug.apk`;
  const packageName = readExportPresetOption(projectDir, "Android", "package/unique_name");

  await buildWebPackage(`./${projectDir}/web`);
  await buildAndroidAar();
  await exportAndroidDebug({
    apkPath,
    projectDir,
    userArgs: ["--kirie-android-aar=debug"],
  });

  await execa("adb", ["install", "-r", apkPath], {
    cwd: rootDir,
    stdio: "inherit",
  });
  await execa(
    "adb",
    ["shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
}

async function runExampleIos(exampleName: string, projectDir: string): Promise<void> {
  const appPath = `${exampleDistDir(exampleName)}/ios_debug.app`;
  const bundleId = readExportPresetOption(projectDir, "iOS", "application/bundle_identifier");
  const simulatorId = process.env.SIMULATOR_ID || "booted";

  await buildWebPackage(`./${projectDir}/web`);
  await buildIosXcframework();
  await exportIosSimulatorApp(projectDir, appPath);

  await execa("xcrun", ["simctl", "install", simulatorId, appPath], {
    cwd: rootDir,
    stdio: "inherit",
  });
  await execa("xcrun", ["simctl", "launch", simulatorId, bundleId], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

// mise task entrypoint.
export async function runExample(platformArg?: string, exampleName?: string): Promise<void> {
  if (!platformArg || !exampleName) {
    throw new Error("Usage: mise run run:example -- <android|ios> <example-name>");
  }

  const platform = platformArg.toLowerCase() as "android" | "ios";
  const projectDir = `examples/${exampleName}`;

  switch (platform) {
    case "android":
      await runExampleAndroid(exampleName, projectDir);
      return;
    case "ios":
      await runExampleIos(exampleName, projectDir);
      return;
    default:
      throw new Error(`Unsupported platform: ${platformArg}`);
  }
}
