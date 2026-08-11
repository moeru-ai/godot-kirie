import path from "node:path";
import { execa } from "execa";

import { buildAndroidAar, buildIosXcframework } from "./build-kirie.ts";
import { distDir, exportAndroidDebug, exportIosApp, rootDir, runKirieCli } from "./build-shared.ts";

function exampleDistDir(exampleName: string): string {
  return `${distDir}/examples/${exampleName}`;
}

async function runExampleAndroid(projectDir: string, device?: string): Promise<void> {
  await buildAndroidAar();
  await exportAndroidDebug({
    projectDir,
    userArgs: ["--kirie-android-aar=debug"],
  });
  await runKirieCli([
    "run",
    "android",
    "--project",
    path.resolve(rootDir, projectDir),
    ...(device ? ["--device", device] : []),
  ]);
}

async function runExampleIos(
  exampleName: string,
  projectDir: string,
  device?: string,
): Promise<void> {
  const appPath = `${exampleDistDir(exampleName)}/${device ? "ios_device" : "ios"}_debug.app`;

  await buildIosXcframework();
  await exportIosApp(projectDir, appPath, device ? "device" : "simulator", device);
  await runKirieCli([
    "run",
    "ios",
    "--project",
    path.resolve(rootDir, projectDir),
    "--app",
    path.resolve(rootDir, appPath),
    ...(device ? ["--device", device, "--terminate-existing"] : []),
  ]);
}

// mise task entrypoint.
export async function runExample(
  platformArg?: string,
  exampleName?: string,
  device?: string,
): Promise<void> {
  if (!platformArg || !exampleName) {
    throw new Error("Usage: mise run run:example -- <android|ios> <example-name> [device-id]");
  }

  const platform = platformArg.toLowerCase() as "android" | "ios";
  const projectDir = `examples/${exampleName}`;

  if (exampleName === "basic-kirie-cli") {
    await execa("corepack", ["pnpm", "-C", projectDir, "run", "build:godot"], {
      cwd: rootDir,
      stdio: "inherit",
    });
  }

  switch (platform) {
    case "android":
      await runExampleAndroid(projectDir, device);
      return;
    case "ios":
      await runExampleIos(exampleName, projectDir, device);
      return;
    default:
      throw new Error(`Unsupported platform: ${platformArg}`);
  }
}

export {
  buildIntegrationAndroid,
  buildIntegrationIos,
  buildIntegrationWeb,
} from "./build-integration.ts";
export {
  buildAndroidAar,
  buildIosDebugXcframework,
  buildIosXcframework,
  checkAddonPack,
  packAddon,
  testSwift,
} from "./build-kirie.ts";

// mise task entrypoints re-exported from the integration host runner.
export {
  runIntegrationAndroidTest,
  runIntegrationDesktopTest,
  runIntegrationIosTest,
} from "./integration-runner.ts";
