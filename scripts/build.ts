import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";
import godotCefConfig from "../packages/kirie/addon/addons/kirie/godot_cef.json" with {
  type: "json",
};

const rootDir = process.cwd();
const distDir = "dist";
const addonSourceDir = "packages/kirie/addon/addons/kirie";
const addonStageDir = `${distDir}/addons/kirie`;
const addonZipPath = `${distDir}/kirie-addon.zip`;
const androidAarOutputDir = "packages/kirie/native/android/plugin/build/outputs/aar";
const androidAddonLibraryDir = "packages/kirie/addon/addons/kirie/libraries/android";
const androidStagedDebugAar = `${addonStageDir}/libraries/android/Kirie-debug.aar`;
const androidStagedReleaseAar = `${addonStageDir}/libraries/android/Kirie-release.aar`;
const iosPluginDir = "packages/kirie/native/ios/Kirie";
const iosBuildDir = `${iosPluginDir}/.build`;
const iosGeneratedDir = `${iosPluginDir}/.generated`;
const iosProjectPath = `${iosGeneratedDir}/Kirie.xcodeproj`;
const iosOutputDir = "packages/kirie/addon/addons/kirie/ios";
const iosOutputXcframework = `${iosOutputDir}/Kirie.xcframework`;
const iosStagedXcframework = `${addonStageDir}/ios/Kirie.xcframework`;
const iosDerivedDataPath = `${iosBuildDir}/DerivedData`;
const integrationProjectDir = "tests/integration";
const integrationDistDir = "dist/integration";
const godotSourceRoot = path.join(rootDir, "godot");

const godotCefAssetName = `godot_cef-v${godotCefConfig.version}.zip`;
const godotCefDownloadUrl = `https://github.com/dsh0416/godot-cef/releases/download/v${godotCefConfig.version}/${godotCefAssetName}`;
const godotCefAddonProjectPath = godotCefConfig.addon_path.replace(/^res:\/\//, "");

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

function assertPathExists(pathToCheck: string): void {
  if (!fs.existsSync(pathToCheck)) {
    throw new Error(`Required addon release path is missing: ${pathToCheck}`);
  }
}

function findSymlink(dirPath: string): string | undefined {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) {
      return entryPath;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const found = findSymlink(entryPath);
    if (found) {
      return found;
    }
  }

  return undefined;
}

export function checkAddonPack(): void {
  assertPathExists(addonStageDir);
  assertPathExists(androidStagedReleaseAar);
  assertPathExists(iosStagedXcframework);
  assertPathExists(`${iosStagedXcframework}/Info.plist`);

  if (fs.existsSync(androidStagedDebugAar)) {
    throw new Error(`Development-only debug AAR must not be included: ${androidStagedDebugAar}`);
  }

  const symlink = findSymlink(addonStageDir);
  if (symlink) {
    throw new Error(`Release addon staging must not contain symlinks: ${symlink}`);
  }
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, bytes);
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export async function installGodotCef(projectDirArg?: string): Promise<void> {
  if (!projectDirArg) {
    throw new Error(
      "Missing Godot project directory: mise run install:godot-cef <godot-project-dir>",
    );
  }

  const projectDir = path.resolve(rootDir, projectDirArg);
  if (!fs.existsSync(path.join(projectDir, "project.godot"))) {
    throw new Error(`Godot project not found: ${projectDir}`);
  }

  const installDir = path.join(projectDir, godotCefAddonProjectPath);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "godot-cef-"));
  const archivePath = path.join(tempDir, godotCefAssetName);
  const extractDir = path.join(tempDir, "extract");

  console.log(`Downloading Godot CEF ${godotCefConfig.version}...`);
  await downloadFile(godotCefDownloadUrl, archivePath);

  const actualSha256 = sha256File(archivePath);
  if (actualSha256 !== godotCefConfig.sha256) {
    throw new Error(
      `Godot CEF checksum mismatch: expected ${godotCefConfig.sha256}, got ${actualSha256}`,
    );
  }

  fs.mkdirSync(extractDir, { recursive: true });
  await execa("unzip", ["-q", archivePath, "-d", extractDir], {
    cwd: rootDir,
    stdio: "inherit",
  });

  const extractedAddon = path.join(extractDir, "dist", godotCefAddonProjectPath);
  if (
    !fs.existsSync(
      path.join(extractedAddon, `${path.basename(godotCefAddonProjectPath)}.gdextension`),
    )
  ) {
    throw new Error(`Downloaded Godot CEF archive does not contain ${godotCefAddonProjectPath}`);
  }

  fs.mkdirSync(path.dirname(installDir), { recursive: true });
  fs.rmSync(installDir, { force: true, recursive: true });
  fs.cpSync(extractedAddon, installDir, { recursive: true });
  fs.rmSync(tempDir, { force: true, recursive: true });

  console.log(
    `Installed Godot CEF ${godotCefConfig.version} to ${path.relative(rootDir, installDir)}`,
  );
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

export async function buildIntegrationWeb(): Promise<void> {
  await execa("corepack", ["pnpm", "--filter", "@gd-kirie/integration-web", "run", "build"], {
    cwd: rootDir,
    stdio: "inherit",
  });
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

export async function packAddon(): Promise<void> {
  fs.rmSync(addonStageDir, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(addonStageDir), { recursive: true });
  fs.cpSync(addonSourceDir, addonStageDir, {
    recursive: true,
    filter: (src) =>
      path.resolve(src) !== path.resolve(`${addonSourceDir}/libraries/android/Kirie-debug.aar`),
  });
  fs.rmSync(androidStagedDebugAar, { force: true });

  checkAddonPack();

  fs.rmSync(addonZipPath, { force: true });
  await execa("zip", ["-r", path.basename(addonZipPath), "addons/kirie"], {
    cwd: path.join(rootDir, distDir),
    stdio: "inherit",
  });
}
