import path from "node:path";
import { buildAndroidAar, buildIosXcframework } from "./build-kirie.ts";
import {
  distDir,
  exportAndroidDebug,
  exportIosSimulatorApp,
  rootDir,
  runKirieCli,
} from "./build-shared.ts";

function exampleDistDir(exampleName: string): string {
  return `${distDir}/examples/${exampleName}`;
}

async function runExampleAndroid(exampleName: string, projectDir: string): Promise<void> {
  const apkPath = `${exampleDistDir(exampleName)}/android_debug.apk`;

  await buildAndroidAar();
  await exportAndroidDebug({
    apkPath,
    projectDir,
    userArgs: ["--kirie-android-aar=debug"],
  });
  await runKirieCli([
    "run",
    "android",
    "--project",
    path.resolve(rootDir, projectDir),
    "--apk",
    path.resolve(rootDir, apkPath),
  ]);
}

async function runExampleIos(exampleName: string, projectDir: string): Promise<void> {
  const appPath = `${exampleDistDir(exampleName)}/ios_debug.app`;

  await buildIosXcframework();
  await exportIosSimulatorApp(projectDir, appPath);
  await runKirieCli([
    "run",
    "ios",
    "--project",
    path.resolve(rootDir, projectDir),
    "--app",
    path.resolve(rootDir, appPath),
  ]);
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
