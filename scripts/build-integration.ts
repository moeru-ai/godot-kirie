import process from "node:process";
import {
  buildWebPackage,
  exportAndroidDebug,
  exportIosSimulatorApp,
  integrationDistDir,
  integrationProjectDir,
} from "./build-shared.ts";

// mise task entrypoint.
export async function buildIntegrationWeb(): Promise<void> {
  await buildWebPackage("@gd-kirie/integration-web");
}

// mise task entrypoint.
export async function buildIntegrationAndroid(): Promise<void> {
  const apkPath = process.env.APK_PATH || `${integrationDistDir}/android_debug.apk`;
  await exportAndroidDebug({ apkPath, projectDir: integrationProjectDir });
  console.log(`Exported ${apkPath}`);
}

// mise task entrypoint.
export async function buildIntegrationIos(): Promise<void> {
  const appPath = process.env.APP_PATH || `${integrationDistDir}/ios_debug.app`;
  await exportIosSimulatorApp(integrationProjectDir, appPath);
}
