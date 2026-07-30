import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";
import { buildAndroidAar, buildIosDebugXcframework } from "./build-kirie.ts";
import { buildWebPackage, distDir, rootDir } from "./build-shared.ts";

const exampleName = "swiftui-embedded";
const appName = "SwiftUIEmbedded";
const presetName = "iOS Embed Debug";
const androidPresetName = "Android Embed Debug";
const marker = "KIRIE_VIEW_EMBED_EVENTA_PASS";
const exampleDir = path.join(rootDir, "examples", exampleName);
const outputRoot = path.join(rootDir, distDir, "examples", exampleName);
const stagedWorkspace = path.join(outputRoot, "workspace");
const stagedProjectDir = path.join(stagedWorkspace, "examples", exampleName);
const exportRoot = path.join(outputRoot, "ios_xcode");
const derivedDataSimulator = path.join(outputRoot, "DerivedData-simulator");
const derivedDataDevice = path.join(outputRoot, "DerivedData-device");
const androidOutputRoot = path.join(outputRoot, "android");
const androidApk = path.join(androidOutputRoot, "ViewEmbedded-debug.apk");
const androidActivity = "com.godot.game.GodotAppLauncher";

interface SimulatorDevice {
  isAvailable?: boolean;
  name?: string;
  state?: string;
  udid?: string;
}

interface SimulatorListing {
  devices?: Record<string, SimulatorDevice[]>;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function resolveGodotSourceRoot(): string {
  const sourceRoot = process.env.GODOT_EMBED_SOURCE_ROOT || process.env.GODOT_SOURCE_ROOT;
  if (!sourceRoot) {
    throw new Error(
      "Set GODOT_EMBED_SOURCE_ROOT to the ios-swift-and-csharp-dotnet Godot checkout.",
    );
  }

  return path.resolve(sourceRoot);
}

function replaceExactlyOnce(source: string, token: string, value: string): string {
  if (source.split(token).length !== 2) {
    throw new Error(`${token} must occur exactly once`);
  }

  return source.replace(token, value);
}

function escapeGodotConfig(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function renderBuildConfiguration(options: {
  androidPackage: string;
  androidSourceTemplate: string;
  bundleId: string;
  godotNugetDir: string;
  teamId: string;
  template: string;
}): void {
  const presetTemplate = fs.readFileSync(path.join(exampleDir, "export_presets.cfg.in"), "utf8");
  const replacements: Record<string, string> = {
    "@ANDROID_PACKAGE@": options.androidPackage,
    "@ANDROID_SOURCE_TEMPLATE@": path.resolve(options.androidSourceTemplate),
    "@BUNDLE@": options.bundleId,
    "@TEAM@": options.teamId,
    "@TEMPLATE@": path.resolve(options.template),
  };
  let preset = presetTemplate;
  for (const [token, value] of Object.entries(replacements)) {
    preset = replaceExactlyOnce(preset, token, escapeGodotConfig(value));
  }
  fs.writeFileSync(path.join(stagedProjectDir, "export_presets.cfg"), preset);

  const nugetTemplate = fs.readFileSync(path.join(exampleDir, "NuGet.Config.in"), "utf8");
  const nugetConfig = replaceExactlyOnce(
    nugetTemplate,
    "@GODOT_NUGET@",
    path.resolve(options.godotNugetDir),
  );
  fs.writeFileSync(path.join(stagedProjectDir, "NuGet.Config"), nugetConfig);
}

function stageExampleProject(): void {
  fs.rmSync(stagedWorkspace, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(stagedProjectDir), { recursive: true });
  const excludedTopLevel = new Set([
    ".godot",
    ".mono",
    "addons",
    "export_presets.cfg",
    "NuGet.Config",
  ]);
  fs.cpSync(exampleDir, stagedProjectDir, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(exampleDir, source);
      const [topLevel, secondLevel] = relative.split(path.sep);
      if (excludedTopLevel.has(topLevel)) {
        return false;
      }
      return !(topLevel === "src-web" && secondLevel === "node_modules");
    },
  });

  const adapterProject = path.join(
    rootDir,
    "packages/GdKirie.EventaAdapter/GdKirie.EventaAdapter.csproj",
  );
  const adapterSourceBridge = path.join(
    rootDir,
    "packages/GdKirie.EventaAdapter/contentFiles/cs/any/GdKirie.EventaAdapter/KirieClientEventaBridge.cs",
  );
  const stagedCsprojPath = path.join(stagedProjectDir, `${appName}.csproj`);
  const stagedCsproj = fs
    .readFileSync(stagedCsprojPath, "utf8")
    .replace("../../packages/GdKirie.EventaAdapter/GdKirie.EventaAdapter.csproj", adapterProject)
    .replace(
      "../../packages/GdKirie.EventaAdapter/contentFiles/cs/any/GdKirie.EventaAdapter/KirieClientEventaBridge.cs",
      adapterSourceBridge,
    );
  fs.writeFileSync(stagedCsprojPath, stagedCsproj);

  const stagedSolutionPath = path.join(stagedProjectDir, `${appName}.sln`);
  const stagedSolution = fs
    .readFileSync(stagedSolutionPath, "utf8")
    .replace(
      "..\\..\\packages\\GdKirie.EventaAdapter\\GdKirie.EventaAdapter.csproj",
      adapterProject,
    );
  fs.writeFileSync(stagedSolutionPath, stagedSolution);

  fs.mkdirSync(path.join(stagedProjectDir, "addons"), { recursive: true });
  fs.cpSync(
    path.join(rootDir, "packages/kirie/addon/addons/kirie"),
    path.join(stagedProjectDir, "addons/kirie"),
    { recursive: true },
  );
}

function installNativeHost(): void {
  const exportedSources = path.join(exportRoot, appName);
  for (const fileName of ["dummy.h", "dummy.swift"]) {
    fs.copyFileSync(
      path.join(exampleDir, "ios-host", fileName),
      path.join(exportedSources, fileName),
    );
  }
}

async function installAndroidHost(androidSourceTemplate: string): Promise<void> {
  const androidBuildDir = path.join(stagedProjectDir, "android/build");
  fs.rmSync(androidBuildDir, { force: true, recursive: true });
  fs.mkdirSync(androidBuildDir, { recursive: true });
  await execa("unzip", ["-q", androidSourceTemplate, "-d", androidBuildDir]);
  fs.writeFileSync(path.join(androidBuildDir, ".gdignore"), "");
  const templateHash = crypto
    .createHash("md5")
    .update(fs.readFileSync(androidSourceTemplate))
    .digest("hex");
  fs.writeFileSync(
    path.join(path.dirname(androidBuildDir), ".build_version"),
    `${androidSourceTemplate} [${templateHash}]\n`,
  );

  const activitySource = path.join(exampleDir, "android-host/GodotApp.kt");
  const activityTarget = path.join(androidBuildDir, "src/main/java/com/godot/game/GodotApp.kt");
  fs.rmSync(path.join(androidBuildDir, "src/main/java/com/godot/game/GodotApp.java"));
  fs.mkdirSync(path.dirname(activityTarget), { recursive: true });
  fs.copyFileSync(activitySource, activityTarget);
}

function pruneMissingMoltenVk(): void {
  if (fs.existsSync(path.join(exportRoot, "MoltenVK.xcframework"))) {
    return;
  }

  const projectFile = path.join(exportRoot, `${appName}.xcodeproj`, "project.pbxproj");
  const project = fs.readFileSync(projectFile, "utf8");
  const filtered = project
    .split(/(?<=\n)/)
    .filter((line) => !line.includes("MoltenVK.xcframework"))
    .join("");
  fs.writeFileSync(projectFile, filtered);
}

function findDirectory(root: string, expectedName: string): string | undefined {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === expectedName) {
      return entryPath;
    }

    const found = findDirectory(entryPath, expectedName);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function verifyExport(): void {
  const projectFile = path.join(exportRoot, `${appName}.xcodeproj`, "project.pbxproj");
  const project = fs.readFileSync(projectFile, "utf8");
  const requiredReferences = [
    "dummy.swift",
    "Kirie.debug.xcframework",
    `${appName}.xcframework`,
    `${appName}_aot.xcframework`,
  ];
  for (const reference of requiredReferences) {
    if (!project.includes(reference)) {
      throw new Error(`Exported Xcode project is missing ${reference}`);
    }
  }
  if (
    project.includes("MoltenVK.xcframework") &&
    !fs.existsSync(path.join(exportRoot, "MoltenVK.xcframework"))
  ) {
    throw new Error("Exported Xcode project contains a dangling MoltenVK reference");
  }
  if (!findDirectory(exportRoot, `${appName}_aot.xcframework`)) {
    throw new Error("Godot .NET export did not produce the NativeAOT XCFramework");
  }
}

async function resolveDotnet(): Promise<string> {
  if (process.env.DOTNET_BIN) {
    return path.resolve(process.env.DOTNET_BIN);
  }

  const result = await execa("mise", ["which", "dotnet"], { cwd: rootDir });
  return result.stdout.trim();
}

async function prepareIosExport(): Promise<void> {
  const godotSourceRoot = resolveGodotSourceRoot();
  const godotEditor = path.resolve(
    process.env.GODOT_EDITOR || path.join(godotSourceRoot, "bin/godot.macos.editor.arm64.mono"),
  );
  const godotTemplate = path.resolve(
    process.env.GODOT_IOS_TEMPLATE || path.join(godotSourceRoot, "bin/godot_ios.zip"),
  );
  const godotNugetDir = path.resolve(
    process.env.GODOT_NUGET_DIR || path.join(godotSourceRoot, "ios_embed_dotnet/nuget"),
  );
  const dotnet = await resolveDotnet();

  for (const requiredPath of [godotEditor, godotTemplate, godotNugetDir, dotnet]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Required build input does not exist: ${requiredPath}`);
    }
  }

  await buildWebPackage("@gd-kirie/swiftui-embedded-web");
  stageExampleProject();
  await buildIosDebugXcframework(
    path.join(stagedProjectDir, "addons/kirie/ios/Kirie.debug.xcframework"),
    godotSourceRoot,
  );
  renderBuildConfiguration({
    androidPackage: process.env.ANDROID_PACKAGE || "ai.moeru.kirie.examples.viewembedded",
    androidSourceTemplate: path.join(godotSourceRoot, "bin/android_source.zip"),
    bundleId: process.env.IOS_BUNDLE_ID || "ai.moeru.kirie.examples.swiftui-embedded",
    godotNugetDir,
    teamId: process.env.IOS_TEAM_ID || "AAAAAAAAAA",
    template: godotTemplate,
  });

  await execa(dotnet, ["restore", "SwiftUIEmbedded.csproj", "--configfile", "NuGet.Config"], {
    cwd: stagedProjectDir,
    stdio: "inherit",
  });
  await execa(dotnet, ["build", "SwiftUIEmbedded.csproj", "--no-restore"], {
    cwd: stagedProjectDir,
    stdio: "inherit",
  });

  fs.rmSync(exportRoot, { force: true, recursive: true });
  fs.mkdirSync(exportRoot, { recursive: true });
  await execa(
    godotEditor,
    [
      "--headless",
      "--path",
      stagedProjectDir,
      "--export-debug",
      presetName,
      path.join(exportRoot, appName),
    ],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${path.dirname(dotnet)}:${process.env.PATH || ""}`,
      },
      stdio: "inherit",
    },
  );

  pruneMissingMoltenVk();
  installNativeHost();
  verifyExport();
}

async function prepareAndroidExport(): Promise<void> {
  const godotSourceRoot = resolveGodotSourceRoot();
  const godotEditor = path.resolve(
    process.env.GODOT_EDITOR || path.join(godotSourceRoot, "bin/godot.macos.editor.arm64.mono"),
  );
  const godotNugetDir = path.resolve(
    process.env.GODOT_NUGET_DIR || path.join(godotSourceRoot, "ios_embed_dotnet/nuget"),
  );
  const androidSourceTemplate = path.resolve(
    process.env.GODOT_ANDROID_SOURCE_TEMPLATE ||
      path.join(godotSourceRoot, "bin/android_source.zip"),
  );
  const dotnet = await resolveDotnet();

  for (const requiredPath of [godotEditor, godotNugetDir, androidSourceTemplate, dotnet]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Required Android build input does not exist: ${requiredPath}`);
    }
  }

  await buildWebPackage("@gd-kirie/swiftui-embedded-web");
  stageExampleProject();
  await buildAndroidAar(path.join(stagedProjectDir, "addons/kirie/libraries/android"));
  renderBuildConfiguration({
    androidPackage: process.env.ANDROID_PACKAGE || "ai.moeru.kirie.examples.viewembedded",
    androidSourceTemplate,
    bundleId: process.env.IOS_BUNDLE_ID || "ai.moeru.kirie.examples.swiftui-embedded",
    godotNugetDir,
    teamId: process.env.IOS_TEAM_ID || "AAAAAAAAAA",
    template: process.env.GODOT_IOS_TEMPLATE || path.join(godotSourceRoot, "bin/godot_ios.zip"),
  });
  await installAndroidHost(androidSourceTemplate);

  await execa(dotnet, ["restore", "SwiftUIEmbedded.csproj", "--configfile", "NuGet.Config"], {
    cwd: stagedProjectDir,
    stdio: "inherit",
  });
  await execa(dotnet, ["build", "SwiftUIEmbedded.csproj", "--no-restore"], {
    cwd: stagedProjectDir,
    stdio: "inherit",
  });

  fs.rmSync(androidOutputRoot, { force: true, recursive: true });
  fs.mkdirSync(androidOutputRoot, { recursive: true });
  const androidSdk = resolveAndroidSdk();
  await execa(
    godotEditor,
    [
      "--headless",
      "--path",
      stagedProjectDir,
      "--export-debug",
      androidPresetName,
      androidApk,
      "--",
      "--kirie-android-aar=debug",
    ],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        ANDROID_HOME: androidSdk,
        ANDROID_SDK_ROOT: androidSdk,
        PATH: `${path.dirname(dotnet)}:${process.env.PATH || ""}`,
      },
      stdio: "inherit",
    },
  );

  if (!fs.existsSync(androidApk)) {
    throw new Error(`Godot Android export did not produce ${androidApk}`);
  }
}

function resolveAndroidSdk(): string {
  return path.resolve(
    process.env.ANDROID_HOME ||
      process.env.ANDROID_SDK_ROOT ||
      path.join(process.env.HOME || "", "Library/Android/sdk"),
  );
}

async function selectAndroidDevice(adb: string, emulator: string): Promise<string> {
  const requestedDevice = process.env.ANDROID_DEVICE_ID;
  if (requestedDevice) {
    return requestedDevice;
  }

  const connected = await execa(adb, ["devices"]);
  const existing = connected.stdout
    .split("\n")
    .map((line) => line.match(/^(emulator-\d+)\s+device$/)?.[1])
    .find((serial) => serial);
  if (existing) {
    return existing;
  }

  const avdList = await execa(emulator, ["-list-avds"]);
  const avdName = process.env.ANDROID_AVD || avdList.stdout.split("\n").find((name) => name.trim());
  if (!avdName) {
    throw new Error("No Android emulator or configured AVD is available");
  }

  const emulatorProcess = execa(emulator, ["-avd", avdName, "-no-snapshot-save"], {
    detached: true,
    stdio: "ignore",
  });
  emulatorProcess.unref();

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const devices = await execa(adb, ["devices"]);
    const serial = devices.stdout
      .split("\n")
      .map((line) => line.match(/^(emulator-\d+)\s+device$/)?.[1])
      .find((value) => value);
    if (serial) {
      return serial;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for Android AVD ${avdName}`);
}

async function waitForAndroidBoot(adb: string, device: string): Promise<void> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const result = await execa(adb, ["-s", device, "shell", "getprop", "sys.boot_completed"], {
      reject: false,
    });
    if (result.stdout.trim() === "1") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for Android device ${device} to boot`);
}

async function waitForAndroidMarker(adb: string, device: string): Promise<string> {
  const deadline = Date.now() + 120_000;
  let latestLog = "";
  while (Date.now() < deadline) {
    const result = await execa(adb, ["-s", device, "logcat", "-d"]);
    latestLog = result.stdout;
    if (latestLog.includes(marker)) {
      return latestLog;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${marker}\n${latestLog.slice(-6000)}`);
}

function simulatorRuntimeVersion(identifier: string): number[] {
  const match = identifier.match(/\.iOS-(\d+(?:-\d+)*)$/);
  return match ? match[1].split("-").map(Number) : [];
}

function compareVersions(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

async function selectSimulator(): Promise<{ name: string; udid: string }> {
  if (process.env.SIMULATOR_ID) {
    return { name: process.env.SIMULATOR_ID, udid: process.env.SIMULATOR_ID };
  }

  const result = await execa("xcrun", ["simctl", "list", "devices", "available", "-j"]);
  const listing = JSON.parse(result.stdout) as SimulatorListing;
  const candidates = Object.entries(listing.devices || {}).flatMap(([runtime, devices]) =>
    devices
      .filter(
        (device) =>
          device.isAvailable && device.name?.startsWith("iPhone") && device.udid && device.state,
      )
      .map((device) => ({
        name: device.name as string,
        runtime,
        state: device.state as string,
        udid: device.udid as string,
      })),
  );
  const pool = candidates.filter((device) => device.state === "Booted");
  const selected = (pool.length > 0 ? pool : candidates).sort((left, right) =>
    compareVersions(simulatorRuntimeVersion(right.runtime), simulatorRuntimeVersion(left.runtime)),
  )[0];
  if (!selected) {
    throw new Error("No available iPhone simulator");
  }

  return selected;
}

async function buildXcodeApp(options: {
  derivedData: string;
  destination: string;
  sdk: "iphoneos" | "iphonesimulator";
  signingArguments: string[];
}): Promise<string> {
  fs.rmSync(options.derivedData, { force: true, recursive: true });
  await execa(
    "xcodebuild",
    [
      "-project",
      path.join(exportRoot, `${appName}.xcodeproj`),
      "-scheme",
      appName,
      "-configuration",
      "Debug",
      "-sdk",
      options.sdk,
      "-destination",
      options.destination,
      "-derivedDataPath",
      options.derivedData,
      ...options.signingArguments,
      "build",
    ],
    { cwd: rootDir, stdio: "inherit" },
  );

  const productDirectory =
    options.sdk === "iphonesimulator" ? "Debug-iphonesimulator" : "Debug-iphoneos";
  const appPath = path.join(
    options.derivedData,
    "Build/Products",
    productDirectory,
    `${appName}.app`,
  );
  if (!fs.existsSync(appPath)) {
    throw new Error(`Xcode did not produce ${appPath}`);
  }

  return appPath;
}

async function readBundleId(appPath: string): Promise<string> {
  const result = await execa("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleIdentifier",
    path.join(appPath, "Info.plist"),
  ]);
  return result.stdout.trim();
}

async function waitForSimulatorMarker(simulatorId: string, processId: string): Promise<string> {
  const deadline = Date.now() + 120_000;
  let latestLog = "";
  while (Date.now() < deadline) {
    const result = await execa(
      "xcrun",
      [
        "simctl",
        "spawn",
        simulatorId,
        "log",
        "show",
        "--last",
        "5m",
        "--info",
        "--style",
        "compact",
        "--predicate",
        `processIdentifier == ${processId}`,
      ],
      { reject: false },
    );
    latestLog = result.stdout;
    if (latestLog.includes(marker)) {
      return latestLog;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${marker}\n${latestLog.slice(-6000)}`);
}

// mise task entrypoint.
export async function buildSwiftuiEmbeddedIos(): Promise<void> {
  await prepareIosExport();
  console.log(`Prepared native SwiftUI host Xcode project: ${exportRoot}`);
}

// mise task entrypoint.
export async function buildSwiftuiEmbeddedAndroid(): Promise<void> {
  await prepareAndroidExport();
  console.log(`Prepared Kotlin-hosted Android application: ${androidApk}`);
}

// mise task entrypoint.
export async function runSwiftuiEmbeddedAndroidEmulator(): Promise<void> {
  await prepareAndroidExport();
  const androidSdk = resolveAndroidSdk();
  const adb = path.join(androidSdk, "platform-tools/adb");
  const emulator = path.join(androidSdk, "emulator/emulator");
  const device = await selectAndroidDevice(adb, emulator);
  await waitForAndroidBoot(adb, device);

  await execa(adb, ["-s", device, "install", "-r", androidApk], { stdio: "inherit" });
  await execa(adb, ["-s", device, "logcat", "-c"]);
  const androidPackage = process.env.ANDROID_PACKAGE || "ai.moeru.kirie.examples.viewembedded";
  await execa(
    adb,
    ["-s", device, "shell", "am", "start", "-W", "-n", `${androidPackage}/${androidActivity}`],
    { stdio: "inherit" },
  );

  const log = await waitForAndroidMarker(adb, device);
  fs.mkdirSync(path.join(androidOutputRoot, "logs"), { recursive: true });
  fs.writeFileSync(path.join(androidOutputRoot, "logs", "emulator.log"), log);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const screenshot = path.join(androidOutputRoot, "emulator.png");
  const screenshotResult = await execa(adb, ["-s", device, "exec-out", "screencap", "-p"], {
    encoding: "buffer",
  });
  fs.writeFileSync(screenshot, screenshotResult.stdout);

  console.log(`${marker} on ${device}`);
  console.log(`Screenshot: ${screenshot}`);
}

// mise task entrypoint.
export async function runSwiftuiEmbeddedIosSimulator(): Promise<void> {
  await prepareIosExport();
  const simulator = await selectSimulator();
  await execa("xcrun", ["simctl", "boot", simulator.udid], { reject: false });
  await execa("xcrun", ["simctl", "bootstatus", simulator.udid, "-b"], { stdio: "inherit" });

  const appPath = await buildXcodeApp({
    derivedData: derivedDataSimulator,
    destination: `platform=iOS Simulator,id=${simulator.udid}`,
    sdk: "iphonesimulator",
    signingArguments: ["CODE_SIGNING_ALLOWED=NO"],
  });
  const bundleId = await readBundleId(appPath);
  await execa("xcrun", ["simctl", "install", simulator.udid, appPath], { stdio: "inherit" });
  const launch = await execa("xcrun", [
    "simctl",
    "launch",
    "--terminate-running-process",
    simulator.udid,
    bundleId,
  ]);
  const processId = launch.stdout.match(/:\s*(\d+)\s*$/)?.[1];
  if (!processId) {
    throw new Error(`Could not read launched process id: ${launch.stdout}`);
  }

  const log = await waitForSimulatorMarker(simulator.udid, processId);
  fs.mkdirSync(path.join(outputRoot, "logs"), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "logs", "simulator.log"), log);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const screenshot = path.join(outputRoot, "simulator.png");
  await execa("xcrun", ["simctl", "io", simulator.udid, "screenshot", screenshot], {
    stdio: "inherit",
  });

  console.log(`${marker} on ${simulator.name} (${simulator.udid})`);
  console.log(`Screenshot: ${screenshot}`);
}

// mise task entrypoint.
export async function runSwiftuiEmbeddedIosDevice(): Promise<void> {
  const xcodeDeviceId = requiredEnvironment("IOS_XCODE_DEVICE_ID");
  const coreDeviceId = requiredEnvironment("IOS_CORE_DEVICE_ID");
  const teamId = requiredEnvironment("IOS_TEAM_ID");
  await prepareIosExport();
  const appPath = await buildXcodeApp({
    derivedData: derivedDataDevice,
    destination: `id=${xcodeDeviceId}`,
    sdk: "iphoneos",
    signingArguments: [`DEVELOPMENT_TEAM=${teamId}`],
  });
  const bundleId = await readBundleId(appPath);
  await execa(
    "xcrun",
    ["devicectl", "device", "install", "app", "--device", coreDeviceId, appPath],
    { stdio: "inherit" },
  );
  await execa(
    "xcrun",
    [
      "devicectl",
      "device",
      "process",
      "launch",
      "--device",
      coreDeviceId,
      "--terminate-existing",
      bundleId,
    ],
    { stdio: "inherit" },
  );
}
