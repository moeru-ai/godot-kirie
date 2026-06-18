import path from "node:path";
import process from "node:process";
import {
  buildWebPackage,
  exportIosSimulatorApp,
  integrationDistDir,
  integrationProjectDir,
  rootDir,
  runKirieCli,
} from "./build-shared.ts";

// mise task entrypoint.
export async function buildIntegrationWeb(): Promise<void> {
  await buildWebPackage("@gd-kirie/integration-web");
}

// mise task entrypoint.
export async function buildIntegrationAndroid(): Promise<void> {
  const apkPath = process.env.APK_PATH || `${integrationDistDir}/android_debug.apk`;
  await runKirieCli([
    "export",
    "android",
    "--project",
    path.resolve(rootDir, integrationProjectDir),
    "--output",
    path.resolve(rootDir, apkPath),
  ]);
  console.log(`Exported ${apkPath}`);
}

// mise task entrypoint.
export async function buildIntegrationIos(): Promise<void> {
  const appPath = process.env.APP_PATH || `${integrationDistDir}/ios_debug.app`;
  await exportIosSimulatorApp(integrationProjectDir, appPath);
}
