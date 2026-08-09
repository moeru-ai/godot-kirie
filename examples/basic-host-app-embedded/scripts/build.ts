import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const appName = "BasicHostAppEmbedded";
const presetName = "iOS Embed Debug";
const androidPresetName = "Android Embed Debug";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(scriptDir, "..");
const exampleName = path.basename(exampleDir);
const rootDir = path.resolve(exampleDir, "../..");
const outputRoot = path.join(rootDir, "dist/examples/basic-host-app-embedded");
const stagedWorkspace = path.join(outputRoot, "workspace");
const stagedProjectDir = path.join(stagedWorkspace, "examples", exampleName);
const exportRoot = path.join(outputRoot, "ios_xcode");
const androidOutputRoot = path.join(outputRoot, "android");
const androidApk = path.join(androidOutputRoot, "ViewEmbedded-debug.apk");
const androidPluginDir = path.join(rootDir, "packages/kirie/native/android");
const androidAarOutputDir = path.join(androidPluginDir, "plugin/build/outputs/aar");
const iosPluginDir = path.join(rootDir, "packages/kirie/native/ios/Kirie");
const iosBuildDir = path.join(iosPluginDir, ".build");
const iosGeneratedDir = path.join(iosPluginDir, ".generated");
const iosProjectPath = path.join(iosGeneratedDir, "Kirie.xcodeproj");
const iosDerivedDataPath = path.join(iosBuildDir, "DerivedData");

async function buildWeb(): Promise<void> {
  const webRoot = path.join(exampleDir, "src-web");
  await execa(process.execPath, [path.join(webRoot, "node_modules/vite/bin/vite.js"), "build"], {
    cwd: webRoot,
    stdio: "inherit",
  });
}

async function buildAndroidAar(outputDir: string): Promise<void> {
  await execa(
    "mise",
    [
      "x",
      "--",
      path.join(androidPluginDir, "gradlew"),
      "--project-dir",
      androidPluginDir,
      ":plugin:assembleDebug",
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = "Kirie-debug.aar";
  fs.copyFileSync(path.join(androidAarOutputDir, fileName), path.join(outputDir, fileName));
}

async function generateIosProject(): Promise<void> {
  fs.mkdirSync(iosGeneratedDir, { recursive: true });
  await execa(
    "xcodegen",
    [
      "generate",
      "--spec",
      path.join(iosPluginDir, "project.yml"),
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
}

async function archiveIosFramework(
  sourceRoot: string,
  destination: string,
  archivePath: string,
): Promise<void> {
  await execa(
    "xcodebuild",
    [
      "archive",
      "-project",
      iosProjectPath,
      "-scheme",
      "Kirie",
      "-configuration",
      "ReleaseDebug",
      "-derivedDataPath",
      iosDerivedDataPath,
      `GODOT_SOURCE_ROOT=${sourceRoot}`,
      "SKIP_INSTALL=NO",
      "BUILD_LIBRARY_FOR_DISTRIBUTION=YES",
      "CODE_SIGNING_ALLOWED=NO",
      "-destination",
      destination,
      "-archivePath",
      archivePath,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
}

async function buildIosDebugXcframework(outputPath: string, sourceRoot: string): Promise<void> {
  fs.mkdirSync(iosBuildDir, { recursive: true });
  await generateIosProject();

  const deviceArchivePath = path.join(iosBuildDir, "Kirie-debug-iOS.xcarchive");
  const simulatorArchivePath = path.join(iosBuildDir, "Kirie-debug-Simulator.xcarchive");
  fs.rmSync(deviceArchivePath, { force: true, recursive: true });
  fs.rmSync(simulatorArchivePath, { force: true, recursive: true });
  fs.rmSync(outputPath, { force: true, recursive: true });

  await archiveIosFramework(sourceRoot, "generic/platform=iOS", deviceArchivePath);
  await archiveIosFramework(sourceRoot, "generic/platform=iOS Simulator", simulatorArchivePath);
  await execa(
    "xcodebuild",
    [
      "-create-xcframework",
      "-framework",
      path.join(deviceArchivePath, "Products/Library/Frameworks/Kirie.framework"),
      "-framework",
      path.join(simulatorArchivePath, "Products/Library/Frameworks/Kirie.framework"),
      "-output",
      outputPath,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
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
    "node_modules",
  ]);
  fs.cpSync(exampleDir, stagedProjectDir, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(exampleDir, source);
      const [topLevel, secondLevel] = relative.split(path.sep);
      if (excludedTopLevel.has(topLevel)) {
        return false;
      }
      if (topLevel === "scripts" && secondLevel === "build.ts") {
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

  await buildWeb();
  stageExampleProject();
  await buildIosDebugXcframework(
    path.join(stagedProjectDir, "addons/kirie/ios/Kirie.debug.xcframework"),
    godotSourceRoot,
  );
  renderBuildConfiguration({
    androidPackage: process.env.ANDROID_PACKAGE || "ai.moeru.kirie.examples.viewembedded",
    androidSourceTemplate: path.join(godotSourceRoot, "bin/android_source.zip"),
    bundleId: process.env.IOS_BUNDLE_ID || "ai.moeru.kirie.examples.basic-host-app-embedded",
    godotNugetDir,
    teamId: process.env.IOS_TEAM_ID || "AAAAAAAAAA",
    template: godotTemplate,
  });

  await execa(dotnet, ["restore", "BasicHostAppEmbedded.csproj", "--configfile", "NuGet.Config"], {
    cwd: stagedProjectDir,
    stdio: "inherit",
  });
  await execa(dotnet, ["build", "BasicHostAppEmbedded.csproj", "--no-restore"], {
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

  await buildWeb();
  stageExampleProject();
  await buildAndroidAar(path.join(stagedProjectDir, "addons/kirie/libraries/android"));
  renderBuildConfiguration({
    androidPackage: process.env.ANDROID_PACKAGE || "ai.moeru.kirie.examples.viewembedded",
    androidSourceTemplate,
    bundleId: process.env.IOS_BUNDLE_ID || "ai.moeru.kirie.examples.basic-host-app-embedded",
    godotNugetDir,
    teamId: process.env.IOS_TEAM_ID || "AAAAAAAAAA",
    template: process.env.GODOT_IOS_TEMPLATE || path.join(godotSourceRoot, "bin/godot_ios.zip"),
  });
  await installAndroidHost(androidSourceTemplate);

  await execa(dotnet, ["restore", "BasicHostAppEmbedded.csproj", "--configfile", "NuGet.Config"], {
    cwd: stagedProjectDir,
    stdio: "inherit",
  });
  await execa(dotnet, ["build", "BasicHostAppEmbedded.csproj", "--no-restore"], {
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

async function prepareIos(): Promise<void> {
  await prepareIosExport();
  console.log(`Prepared native SwiftUI host Xcode project: ${exportRoot}`);
}

async function prepareAndroid(): Promise<void> {
  await prepareAndroidExport();
  console.log(`Prepared Kotlin-hosted Android application: ${androidApk}`);
}

const commands = {
  "prepare-android": prepareAndroid,
  "prepare-ios": prepareIos,
} satisfies Record<string, () => Promise<void>>;

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    console.log(`Usage: node scripts/build.ts <command>

Commands:
  prepare-android
  prepare-ios`);
    return;
  }

  const run = commands[command as keyof typeof commands];
  if (!run) {
    throw new Error(`Unknown command: ${command}`);
  }

  await run();
}

await main();
