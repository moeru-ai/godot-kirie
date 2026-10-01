import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

import { GODOT_CEF_SHA256, GODOT_CEF_VERSION, KIRIE_ADDON_VERSION } from "../addon-versions.ts";
import {
  createBasicKirieCliProjectTracker,
  installGodotCefFixture,
  installKirieConfigFixture,
  installProjectFixture,
} from "../test-project.ts";
import { checkKirieAddon, installGodotCef, installKirieAddon } from "./addons.ts";
import {
  checkAndroidSdk,
  checkGodotCefPrerequisite,
  checkGodotCommand,
  checkGodotExportTemplates,
  checkKirieAddonPrerequisite,
  DoctorCheckStatus,
} from "./index.ts";

const cliPath = fileURLToPath(import.meta.resolve("../cli.ts"));
const projects = createBasicKirieCliProjectTracker("kirie-cli-doctor-");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all([
    projects.cleanup(),
    ...tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })),
  ]);
});

describe("doctor command", () => {
  it("checks Godot export templates and the Android SDK from the CLI", async () => {
    const project = await projects.copy();
    await writeKirieAddonFixture(project, KIRIE_ADDON_VERSION);
    const homeDir = await createTempDir("kirie-doctor-home-");
    const sdk = await createTempDir("kirie-doctor-sdk-");
    await fs.mkdir(resolveTemplatesDir(homeDir, "4.5.stable"), { recursive: true });
    await fs.writeFile(path.join(resolveTemplatesDir(homeDir, "4.5.stable"), "web_debug.zip"), "");
    await installProjectFixture(project, "fake-godot.js");
    await installKirieConfigFixture(project, "dev-fake-godot.kirie.config.ts");

    const result = await execa(process.execPath, [cliPath, "doctor", "--project", project], {
      cwd: path.dirname(project),
      env: {
        ANDROID_HOME: sdk,
        HOME: homeDir,
        USERPROFILE: homeDir,
      },
    });

    expect(result.stdout).toContain("ok Godot command: 4.5.stable");
    expect(result.stdout).toContain("ok Godot export templates:");
    expect(result.stdout).toContain(`ok Android SDK: ANDROID_HOME=${sdk}`);
    expect(result.stdout).toContain("warn Godot CEF: not installed");
    expect(result.stdout).toContain("ok Kirie addon:");
  });

  it("checks only Godot CEF even when the Kirie addon is missing", async () => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });

    const result = await execa(
      process.execPath,
      [cliPath, "doctor", "--project", project, "godot-cef"],
      { cwd: path.dirname(project) },
    );

    expect(result.stdout).toContain("warn Godot CEF: not installed");
    expect(result.stdout).not.toContain("Godot command");
    expect(result.stdout).not.toContain("Android SDK");
  });

  it("rejects unknown doctor targets", async () => {
    const project = await projects.copy();

    await expect(
      execa(process.execPath, [cliPath, "doctor", "--project", project, "unknown"]),
    ).rejects.toThrow("Unknown doctor target: unknown");
  });

  it("reports a missing Kirie addon without downloading it", async () => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });

    const result = await execa(process.execPath, [cliPath, "doctor", "kirie-addon", "--project", project], {
      reject: false,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("fail Kirie addon: not installed");
    expect(result.stdout).toContain("pnpm kirie doctor --fix kirie-addon");
    expect(result.stdout).not.toContain("Godot CEF:");
    await expect(fs.stat(path.join(project, "addons", "kirie"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs only the selected Kirie addon target", async () => {
    const project = await projects.copy();
    await writeKirieAddonFixture(project, KIRIE_ADDON_VERSION);
    const result = await execa(process.execPath, [cliPath, "doctor", "--fix", "kirie-addon", "--project", project]);

    expect(result.stdout).toContain("Kirie addon is already installed");
    expect(result.stdout).toContain("ok Kirie addon:");
    expect(result.stdout).not.toContain("Godot CEF");
    await expect(fs.stat(path.join(project, "addons", "godot_cef"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects extra doctor targets", async () => {
    const project = await projects.copy();

    await expect(
      execa(process.execPath, [cliPath, "doctor", "godot-cef", "extra", "--project", project]),
    ).rejects.toThrow("Unexpected doctor argument: extra");
  });

  it("accepts the fix target before or after the fix flag", async () => {
    const project = await projects.copy();
    await installGodotCefFixture(project);

    const fixThenTarget = await execa(
      process.execPath,
      [cliPath, "doctor", "--fix", "godot-cef", "--project", project],
      { cwd: path.dirname(project) },
    );
    const targetThenFix = await execa(
      process.execPath,
      [cliPath, "doctor", "godot-cef", "--fix", "--project", project],
      { cwd: path.dirname(project) },
    );

    expect(fixThenTarget.stdout).toContain("Godot CEF is already installed");
    expect(targetThenFix.stdout).toContain("ok Godot CEF:");
  });

  it("applies every supported fixer when the fix target is omitted", async () => {
    const project = await projects.copy();
    await writeKirieAddonFixture(project, KIRIE_ADDON_VERSION);
    const homeDir = await createTempDir("kirie-doctor-home-");
    const sdk = await createTempDir("kirie-doctor-sdk-");
    await fs.mkdir(resolveTemplatesDir(homeDir, "4.5.stable"), { recursive: true });
    await fs.writeFile(path.join(resolveTemplatesDir(homeDir, "4.5.stable"), "web_debug.zip"), "");
    await installProjectFixture(project, "fake-godot.js");
    await installKirieConfigFixture(project, "dev-fake-godot.kirie.config.ts");
    await installGodotCefFixture(project);

    const result = await execa(
      process.execPath,
      [cliPath, "doctor", "--fix", "--project", project],
      {
        cwd: path.dirname(project),
        env: {
          ANDROID_HOME: sdk,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
      },
    );

    expect(result.stdout).toContain("Godot CEF is already installed");
    expect(result.stdout).toContain("Kirie addon is already installed");
    expect(result.stdout).toContain("ok Godot CEF:");
  });
});

describe("Kirie addon doctor support", () => {
  it("installs the pinned release through the shared downloader and skips a matching installation", async () => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });
    const archive = Buffer.from("Kirie archive fixture");
    await installKirieAddon({
      projectDir: project,
      download: async (options) => {
        expect(options.url).toBe(`https://github.com/moeru-ai/godot-kirie/releases/download/v${KIRIE_ADDON_VERSION}/kirie-addon.zip`);
        await fs.writeFile(options.outputPath, archive);
      },
      extractArchive: async (archivePath, outputDir) => {
        await expect(fs.readFile(archivePath)).resolves.toEqual(archive);
        await writeKirieAddonFixture(outputDir, KIRIE_ADDON_VERSION);
      },
    });

    await expect(checkKirieAddonPrerequisite(project)).resolves.toMatchObject({ status: DoctorCheckStatus.Ok });
    await installKirieAddon({
      projectDir: project,
      download: async () => { throw new Error("Matching installations must be reused"); },
    });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it("replaces an outdated Kirie addon without removing sibling addons", async () => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });
    await writeKirieAddonFixture(project, "0.0.0");
    await fs.writeFile(path.join(project, "addons", "kirie", "obsolete.gd"), "old release");
    await installGodotCefFixture(project);
    await expect(checkKirieAddon(project)).resolves.toMatchObject({ installed: true, valid: false });

    await installKirieAddon({
      projectDir: project,
      download: async (options) => fs.writeFile(options.outputPath, "archive fixture"),
      extractArchive: async (_archive, outputDir) => writeKirieAddonFixture(outputDir, KIRIE_ADDON_VERSION),
    });

    await expect(checkKirieAddon(project)).resolves.toMatchObject({ installed: true, valid: true });
    await expect(fs.stat(path.join(project, "addons", "kirie", "obsolete.gd"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(checkGodotCefPrerequisite(project)).resolves.toMatchObject({ status: DoctorCheckStatus.Ok });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it.each(["wrong version", "missing script", "download failure"])("preserves the previous addon after %s", async (failure) => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });
    await writeKirieAddonFixture(project, "0.0.0");
    const previousConfig = await fs.readFile(path.join(project, "addons", "kirie", "plugin.cfg"), "utf8");

    await expect(installKirieAddon({
      projectDir: project,
      download: async (options) => {
        if (failure === "download failure") {
          throw new Error("Download failed");
        }
        await fs.writeFile(options.outputPath, "archive fixture");
      },
      extractArchive: async (_archive, outputDir) => {
        await writeKirieAddonFixture(outputDir, failure === "wrong version" ? "0.0.0" : KIRIE_ADDON_VERSION);
        if (failure === "missing script") {
          await fs.rm(path.join(outputDir, "addons", "kirie", "plugin.gd"));
        }
      },
    })).rejects.toThrow();

    await expect(fs.readFile(path.join(project, "addons", "kirie", "plugin.cfg"), "utf8")).resolves.toBe(previousConfig);
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it("reports an incomplete installation even when its plugin version matches", async () => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });
    await writeKirieAddonFixture(project, KIRIE_ADDON_VERSION);
    await fs.rm(path.join(project, "addons", "kirie", "kirie_node.gd"));

    await expect(checkKirieAddonPrerequisite(project)).resolves.toMatchObject({ status: DoctorCheckStatus.Fail });
  });
});

describe("Godot CEF doctor support", () => {
  it("reports a missing optional addon as a warning", async () => {
    const project = await projects.copy();

    await expect(checkGodotCefPrerequisite(project)).resolves.toMatchObject({
      name: "Godot CEF",
      status: DoctorCheckStatus.Warn,
    });
  });

  it("installs and recognizes the pinned release without a Kirie addon", async () => {
    const project = await projects.copy();
    const archive = Buffer.from("tiny Godot CEF archive fixture");
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });

    await installGodotCef({
      download: async (options) => {
        expect(options.url).toBe(
          `https://github.com/dsh0416/godot-cef/releases/download/v${GODOT_CEF_VERSION}/godot_cef-v${GODOT_CEF_VERSION}.zip`,
        );
        expect(options.expectedSha256).toBe(GODOT_CEF_SHA256);
        await fs.writeFile(options.outputPath, archive);
      },
      extractArchive: async (archivePath, outputDir) => {
        await expect(fs.readFile(archivePath)).resolves.toEqual(archive);
        const extractedAddon = path.join(outputDir, "dist", "addons", "godot_cef");
        await fs.mkdir(extractedAddon, { recursive: true });
        await fs.writeFile(path.join(extractedAddon, "godot_cef.gdextension"), "[configuration]\n");
      },
      projectDir: project,
    });

    await expect(
      fs.stat(path.join(project, "addons", "godot_cef", "godot_cef.gdextension")),
    ).resolves.toBeDefined();
    await expect(checkGodotCefPrerequisite(project)).resolves.toMatchObject({
      status: DoctorCheckStatus.Ok,
    });
    await installGodotCef({
      download: async () => {
        throw new Error("An installed matching release must not be downloaded again");
      },
      projectDir: project,
    });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it("reports an installed addon from a different release as a failure", async () => {
    const project = await projects.copy();
    await installGodotCefFixture(project);
    await fs.writeFile(path.join(project, ".godot", "kirie", "godot-cef.sha256"), "0".repeat(64));

    await expect(checkGodotCefPrerequisite(project)).resolves.toMatchObject({
      message: expect.stringContaining(`does not match ${GODOT_CEF_VERSION}`),
      status: DoctorCheckStatus.Fail,
    });
  });

  it("leaves no addon or staging directory after a checksum failure", async () => {
    const project = await projects.copy();

    await expect(
      installGodotCef({
        download: async () => {
          throw new Error("Godot CEF checksum mismatch");
        },
        output: { isTTY: false, write: () => true },
        projectDir: project,
      }),
    ).rejects.toThrow("Godot CEF checksum mismatch");

    await expect(fs.stat(path.join(project, "addons", "godot_cef"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it("does not install an archive with the wrong layout", async () => {
    const project = await projects.copy();
    const archive = Buffer.from("valid checksum, invalid layout");

    await expect(
      installGodotCef({
        download: async (options) => fs.writeFile(options.outputPath, archive),
        extractArchive: async (_archivePath, outputDir) => {
          await fs.mkdir(path.join(outputDir, "unexpected"), { recursive: true });
        },
        output: { isTTY: false, write: () => true },
        projectDir: project,
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await expect(fs.stat(path.join(project, "addons", "godot_cef"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });
});

describe("checkAndroidSdk", () => {
  it("passes when ANDROID_HOME points at an existing SDK directory", async () => {
    const sdk = await createTempDir("kirie-android-sdk-");

    const check = await checkAndroidSdk({ ANDROID_HOME: sdk });

    expect(check).toMatchObject({
      message: `ANDROID_HOME=${sdk}`,
      name: "Android SDK",
      status: "ok",
    });
  });

  it("fails when no Android SDK environment variable is configured", async () => {
    const check = await checkAndroidSdk({});

    expect(check).toMatchObject({
      name: "Android SDK",
      status: "fail",
    });
  });
});

describe("checkGodotCommand", () => {
  it("passes with the normalized Godot version", async () => {
    const result = await checkGodotCommand({
      godotArgs: [],
      godotCommand: "godot",
      projectDir: os.tmpdir(),
      runGodotVersion: async () => "4.5.stable.official.876b29033",
    });

    expect(result).toMatchObject({
      check: {
        message: "4.5.stable",
        name: "Godot command",
        status: "ok",
      },
      version: "4.5.stable",
    });
  });

  it("fails when the Godot command cannot report a version", async () => {
    const result = await checkGodotCommand({
      godotArgs: [],
      godotCommand: "missing-godot",
      projectDir: os.tmpdir(),
      runGodotVersion: async () => {
        throw new Error("not found");
      },
    });

    expect(result).toMatchObject({
      check: {
        message: "could not run missing-godot --version: not found",
        name: "Godot command",
        status: "fail",
      },
    });
  });
});

describe("checkGodotExportTemplates", () => {
  it("passes when templates for the active Godot version are installed", async () => {
    const homeDir = await createTempDir("kirie-godot-home-");
    const templateDir = path.join(
      homeDir,
      "Library",
      "Application Support",
      "Godot",
      "export_templates",
      "4.5.stable",
    );
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(path.join(templateDir, "android_debug.apk"), "");

    const check = await checkGodotExportTemplates({
      homeDir,
      platform: "darwin",
      version: "4.5.stable",
    });

    expect(check).toMatchObject({
      message: templateDir,
      name: "Godot export templates",
      status: "ok",
    });
  });

  it("fails when templates for the active Godot version are missing", async () => {
    const homeDir = await createTempDir("kirie-godot-home-");

    const check = await checkGodotExportTemplates({
      homeDir,
      platform: "darwin",
      version: "4.5.stable",
    });

    expect(check).toMatchObject({
      name: "Godot export templates",
      status: "fail",
    });
  });

  it("uses the full Godot version config for .NET export templates", async () => {
    const homeDir = await createTempDir("kirie-godot-home-");
    const templateDir = path.join(
      homeDir,
      "Library",
      "Application Support",
      "Godot",
      "export_templates",
      "4.5.stable.mono",
    );
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(path.join(templateDir, "ios.zip"), "");

    const check = await checkGodotExportTemplates({
      homeDir,
      platform: "darwin",
      version: "4.5.stable.mono",
    });

    expect(check).toMatchObject({
      message: templateDir,
      name: "Godot export templates",
      status: "ok",
    });
  });
});

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeKirieAddonFixture(project: string, version: string): Promise<void> {
  const directory = path.join(project, "addons", "kirie");
  await fs.rm(directory, { force: true, recursive: true });
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "plugin.cfg"), `[plugin]\nversion="${version}"\nscript="plugin.gd"\n`);
  for (const file of ["plugin.gd", "kirie_node.gd", "gd_kirie.gd"]) {
    await fs.writeFile(path.join(directory, file), "extends RefCounted\n");
  }
}

async function listAddonStagingDirs(project: string): Promise<string[]> {
  const projectParent = await fs.readdir(path.dirname(project));
  return projectParent.filter((entry) => entry.startsWith(".kirie-addon-stage-"));
}

function resolveTemplatesDir(homeDir: string, version: string): string {
  if (process.platform === "darwin") {
    return path.join(
      homeDir,
      "Library",
      "Application Support",
      "Godot",
      "export_templates",
      version,
    );
  }

  if (process.platform === "win32") {
    return path.join(homeDir, "AppData", "Roaming", "Godot", "export_templates", version);
  }

  return path.join(homeDir, ".local", "share", "godot", "export_templates", version);
}
