import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { parallel } from "gulp";

const rootDir = process.cwd();
const androidAarOutputDir = "packages/kirie/native/android/plugin/build/outputs/aar";
const androidAddonLibraryDir = "packages/kirie/addon/addons/kirie/libraries/android";
const iosPluginDir = "packages/kirie/native/ios/Kirie";
const iosBuildDir = `${iosPluginDir}/.build`;
const iosGeneratedDir = `${iosPluginDir}/.generated`;
const iosProjectPath = `${iosGeneratedDir}/Kirie.xcodeproj`;
const iosOutputDir = "packages/kirie/addon/addons/kirie/ios";
const iosOutputXcframework = `${iosOutputDir}/Kirie.xcframework`;
const iosDerivedDataPath = `${iosBuildDir}/DerivedData`;
const integrationProjectDir = "tests/integration";
const integrationDistDir = "dist/integration";
const godotSourceRoot = path.join(rootDir, "godot");

function findSimulatorLibgodot(dirPath: string): string | undefined {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const found = findSimulatorLibgodot(entryPath);
      if (found) {
        return found;
      }
    } else if (
      entry.name === "libgodot.a" &&
      (entryPath.includes("ios-arm64_x86_64-simulator") ||
        entryPath.includes("ios-arm64-simulator"))
    ) {
      return entryPath;
    }
  }

  return undefined;
}

export async function buildAndroidAar(): Promise<void> {
  await execa(
    "mise",
    [
      "x",
      "--",
      "packages/kirie/native/android/gradlew",
      "--project-dir",
      "packages/kirie/native/android",
      ":plugin:assembleDebug",
      ":plugin:assembleRelease",
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  fs.mkdirSync(androidAddonLibraryDir, { recursive: true });

  const debugAar = `${androidAddonLibraryDir}/Kirie-debug.aar`;
  fs.rmSync(debugAar, { force: true });
  fs.copyFileSync(`${androidAarOutputDir}/Kirie-debug.aar`, debugAar);

  const releaseAar = `${androidAddonLibraryDir}/Kirie-release.aar`;
  fs.rmSync(releaseAar, { force: true });
  fs.copyFileSync(`${androidAarOutputDir}/Kirie-release.aar`, releaseAar);
}

export async function buildIosXcframework(): Promise<void> {
  fs.mkdirSync(iosBuildDir, { recursive: true });
  fs.mkdirSync(iosGeneratedDir, { recursive: true });
  fs.mkdirSync(iosOutputDir, { recursive: true });

  await execa(
    "xcodegen",
    [
      "generate",
      "--spec",
      `${iosPluginDir}/project.yml`,
      "--project-root",
      iosPluginDir,
      "--project",
      iosGeneratedDir,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  const deviceArchivePath = `${iosBuildDir}/Kirie-iOS.xcarchive`;
  const simulatorArchivePath = `${iosBuildDir}/Kirie-Simulator.xcarchive`;

  fs.rmSync(deviceArchivePath, { force: true, recursive: true });
  fs.rmSync(simulatorArchivePath, { force: true, recursive: true });
  fs.rmSync(iosOutputXcframework, { force: true, recursive: true });

  const archiveArgs = [
    "-project",
    iosProjectPath,
    "-scheme",
    "Kirie",
    "-configuration",
    "Release",
    "-derivedDataPath",
    iosDerivedDataPath,
    `GODOT_SOURCE_ROOT=${godotSourceRoot}`,
    "SKIP_INSTALL=NO",
    "BUILD_LIBRARY_FOR_DISTRIBUTION=YES",
    "CODE_SIGNING_ALLOWED=NO",
  ];

  await execa(
    "xcodebuild",
    [
      "archive",
      ...archiveArgs,
      "-destination",
      "generic/platform=iOS",
      "-archivePath",
      deviceArchivePath,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  await execa(
    "xcodebuild",
    [
      "archive",
      ...archiveArgs,
      "-destination",
      "generic/platform=iOS Simulator",
      "-archivePath",
      simulatorArchivePath,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  await execa(
    "xcodebuild",
    [
      "-create-xcframework",
      "-framework",
      `${deviceArchivePath}/Products/Library/Frameworks/Kirie.framework`,
      "-framework",
      `${simulatorArchivePath}/Products/Library/Frameworks/Kirie.framework`,
      "-output",
      iosOutputXcframework,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
}

export async function buildIntegrationAndroid(): Promise<void> {
  const apkPath = process.env.APK_PATH || `${integrationDistDir}/android_debug.apk`;
  fs.mkdirSync(path.dirname(apkPath), { recursive: true });

  await execa(
    "mise",
    [
      "x",
      "--",
      "godot",
      "--headless",
      "--path",
      integrationProjectDir,
      "--install-android-build-template",
      "--export-debug",
      "Android",
      `../../${apkPath}`,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  console.log(`Exported ${apkPath}`);
}

export async function buildIntegrationIos(): Promise<void> {
  const appPath = process.env.APP_PATH || `${integrationDistDir}/ios_debug.app`;
  const xcodeExportDir = `${integrationDistDir}/ios_xcode`;
  const projectName = "integration";

  fs.mkdirSync(path.dirname(appPath), { recursive: true });
  fs.mkdirSync(xcodeExportDir, { recursive: true });

  const arm64Source = path.join(
    godotSourceRoot,
    "bin/libgodot.ios.template_debug.arm64.simulator.a",
  );

  if (fs.existsSync(arm64Source)) {
    console.log(`Using existing Godot iOS arm64 simulator template: ${arm64Source}`);
  } else {
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
  }

  console.log("Exporting Xcode project...");
  await execa(
    "mise",
    [
      "x",
      "--",
      "godot",
      "--headless",
      "--path",
      integrationProjectDir,
      "--export-debug",
      "iOS",
      `../../${xcodeExportDir}/${projectName}.xcodeproj`,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  const simulatorLibgodot = findSimulatorLibgodot(xcodeExportDir);
  if (!simulatorLibgodot) {
    throw new Error(`xcframework simulator libgodot.a not found under ${xcodeExportDir}`);
  }

  const { stdout: simulatorInfo } = await execa("lipo", ["-info", simulatorLibgodot], {
    cwd: rootDir,
  });

  if (simulatorInfo.includes("Non-fat")) {
    console.log("Patching simulator libgodot by creating a fat archive...");
    await execa("lipo", ["-create", arm64Source, simulatorLibgodot, "-output", simulatorLibgodot], {
      cwd: rootDir,
      stdio: "inherit",
    });
  } else {
    console.log("Patching simulator libgodot by replacing the arm64 slice...");
    const strippedLib = "/tmp/xcfw_stripped.a";
    await execa("lipo", [simulatorLibgodot, "-remove", "arm64", "-output", strippedLib], {
      cwd: rootDir,
      stdio: "inherit",
    });
    await execa("lipo", ["-create", arm64Source, strippedLib, "-output", simulatorLibgodot], {
      cwd: rootDir,
      stdio: "inherit",
    });
  }

  console.log("Building final .app bundle...");
  const rawBuildDir = path.join(rootDir, "dist/integration_raw_build");
  await execa(
    "mise",
    [
      "x",
      "--",
      "xcodebuild",
      "-project",
      `${xcodeExportDir}/${projectName}.xcodeproj`,
      "-scheme",
      projectName,
      "-sdk",
      "iphonesimulator",
      "-destination",
      "generic/platform=iOS Simulator",
      "-configuration",
      "Debug",
      `CONFIGURATION_BUILD_DIR=${rawBuildDir}`,
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

  const rawApp = path.join(rawBuildDir, `${projectName}.app`);
  console.log(`Moving ${rawApp} -> ${appPath}`);
  fs.mkdirSync(path.dirname(appPath), { recursive: true });
  fs.rmSync(appPath, { force: true, recursive: true });
  fs.renameSync(rawApp, appPath);
  fs.rmSync(rawBuildDir, { force: true, recursive: true });
  console.log(`Successfully built: ${appPath}`);
}

export const buildNativeArtifacts = parallel(buildAndroidAar, buildIosXcframework);
