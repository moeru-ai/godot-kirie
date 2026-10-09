import type { KirieGodotAddonDependency } from "../plugin.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import cliPackage from "../../package.json" with { type: "json" };
import { parseDoctorTarget } from "../commands.ts";
import { type ResolvedKirieConfig, resolveKirieConfig } from "../config.ts";
import {
  createBasicKirieCliProjectTracker,
  installGodotCefFixture,
} from "../test-project.ts";
import { checkGodotAddon, installGodotAddon } from "./addons.ts";
import {
  checkAndroidSdk,
  checkGodotCommand,
  checkGodotExportTemplates,
  runDoctor,
} from "./index.ts";

const projects = createBasicKirieCliProjectTracker("kirie-cli-doctor-");
const tempDirs: string[] = [];
const KIRIE_ADDON_VERSION = cliPackage.version;
const GODOT_CEF_VERSION = "2.0.0";
const GODOT_CEF_SHA256 = "51adbd1c4bae7dc53c6d64226ecce3cdefedf71a69f86ccb0f8f3db4d978c838";
const kirieAddon: KirieGodotAddonDependency = {
  id: "kirie",
  path: "addons/kirie",
  requiredFiles: ["plugin.cfg", "plugin.gd", "kirie_node.gd", "gd_kirie.gd"],
  source: { type: "package", url: pathToFileURL(path.join(os.tmpdir(), "unused")).href },
  version: KIRIE_ADDON_VERSION,
};
const godotCefAddon: KirieGodotAddonDependency = {
  id: "godot-cef",
  optional: true,
  path: "addons/godot_cef",
  requiredFiles: ["godot_cef.gdextension"],
  source: {
    archivePath: "dist/addons/godot_cef",
    sha256: GODOT_CEF_SHA256,
    type: "archive",
    url: `https://github.com/dsh0416/godot-cef/releases/download/v${GODOT_CEF_VERSION}/godot_cef-v${GODOT_CEF_VERSION}.zip`,
  },
  version: GODOT_CEF_VERSION,
};
const kirieArchiveAddon: KirieGodotAddonDependency = {
  ...kirieAddon,
  source: {
    archivePath: "addons/kirie",
    sha256: "fixture checksum",
    type: "archive",
    url: "https://example.com/kirie-addon.zip",
  },
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    projects.cleanup(),
    ...tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })),
  ]);
});

describe("doctor command", () => {
  it("checks only the selected plugin without environment diagnostics", async () => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });
    const output = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runDoctor({
      config: createCoreConfig(project),
      target: "plugin:core",
    })).rejects.toThrow("kirie doctor found 1 problem(s)");

    expect(loggedOutput(output)).toContain("fail core / kirie: not installed");
    expect(loggedOutput(output)).toContain("warn core / godot-cef: not installed");
    expect(loggedOutput(output)).not.toContain("Godot command");
  });

  it("parses only one plugin target", () => {
    expect(parseDoctorTarget("plugin:core", ["plugin:core"])).toBe("plugin:core");
    expect(() => parseDoctorTarget("unknown", ["unknown"])).toThrow("Unknown doctor target: unknown");
    expect(() => parseDoctorTarget("plugin:core", ["plugin:core", "extra"]))
      .toThrow("Unexpected doctor argument: extra");
  });

  it("rejects plugin targets that are not configured", async () => {
    const project = await projects.copy();

    await expect(runDoctor({
      config: createCoreConfig(project),
      target: "plugin:missing",
    })).rejects.toThrow("Kirie plugin is not configured: missing");
  });

  it("repairs only the selected plugin", async () => {
    const project = await projects.copy();
    await writeKirieAddonFixture(project, KIRIE_ADDON_VERSION);
    await installGodotCefFixture(project);
    const output = vi.spyOn(console, "log").mockImplementation(() => {});

    await runDoctor({
      config: createCoreConfig(project),
      fix: true,
      target: "plugin:core",
    });

    expect(loggedOutput(output)).toContain("kirie is already installed");
    expect(loggedOutput(output)).toContain("godot-cef is already installed");
    expect(loggedOutput(output)).toContain("ok core / kirie:");
    expect(loggedOutput(output)).not.toContain("Godot command");
  });
});

describe("Kirie addon doctor support", () => {
  it("upgrades Kirie without removing sibling addons and reuses the matching installation", async () => {
    const project = await projects.copy();
    await writeKirieAddonFixture(project, "0.0.0");
    await fs.writeFile(path.join(project, "addons", "kirie", "obsolete.gd"), "old release");
    await installGodotCefFixture(project);
    await expect(checkGodotAddon(project, kirieAddon)).resolves.toMatchObject({
      installed: true,
      valid: false,
    });
    const archive = Buffer.from("Kirie archive fixture");
    await installGodotAddon({
      addon: kirieArchiveAddon,
      projectDir: project,
      download: async (options) => {
        expect(options.url).toBe("https://example.com/kirie-addon.zip");
        await fs.writeFile(options.outputPath, archive);
      },
      extractArchive: async (archivePath, outputDir) => {
        await expect(fs.readFile(archivePath)).resolves.toEqual(archive);
        await writeKirieAddonFixture(outputDir, KIRIE_ADDON_VERSION);
      },
    });

    await expect(checkGodotAddon(project, kirieAddon)).resolves.toMatchObject({ valid: true });
    await expect(fs.stat(path.join(project, "addons", "kirie", "obsolete.gd"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(checkGodotAddon(project, godotCefAddon)).resolves.toMatchObject({ valid: true });
    await installGodotAddon({
      addon: kirieArchiveAddon,
      projectDir: project,
      download: async () => { throw new Error("Matching installations must be reused"); },
    });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it.each(["wrong version", "missing script", "download failure"])("preserves the previous addon after %s", async (failure) => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });
    await writeKirieAddonFixture(project, "0.0.0");
    const previousConfig = await fs.readFile(path.join(project, "addons", "kirie", "plugin.cfg"), "utf8");

    await expect(installGodotAddon({
      addon: kirieArchiveAddon,
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

    await expect(checkGodotAddon(project, kirieAddon)).resolves.toMatchObject({ valid: false });
  });

  it("copies an addon bundled in a plugin package", async () => {
    const project = await projects.copy();
    const packageRoot = await createTempDir("kirie-package-addon-");
    await writeKirieAddonFixture(packageRoot, KIRIE_ADDON_VERSION);
    const packagedAddon = {
      ...kirieAddon,
      source: {
        type: "package" as const,
        url: pathToFileURL(path.join(packageRoot, "addons", "kirie")).href,
      },
    };
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });

    await installGodotAddon({ addon: packagedAddon, projectDir: project });

    await expect(checkGodotAddon(project, packagedAddon)).resolves.toMatchObject({ valid: true });
  });
});

describe("Godot CEF doctor support", () => {
  it("installs and recognizes the pinned release without a Kirie addon", async () => {
    const project = await projects.copy();
    const archive = Buffer.from("tiny Godot CEF archive fixture");
    await fs.rm(path.join(project, "addons", "kirie"), { force: true, recursive: true });

    await installGodotAddon({
      addon: godotCefAddon,
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
    await expect(checkGodotAddon(project, godotCefAddon)).resolves.toMatchObject({ valid: true });
    await installGodotAddon({
      addon: godotCefAddon,
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

    await expect(checkGodotAddon(project, godotCefAddon)).resolves.toMatchObject({
      message: expect.stringContaining(`does not match ${GODOT_CEF_VERSION}`),
      valid: false,
    });
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

function createCoreConfig(project: string): ResolvedKirieConfig {
  return resolveKirieConfig(
    {
      plugins: [{
        godotAddons: [kirieAddon, godotCefAddon],
        id: "core",
      }],
    },
    { cwd: project },
  );
}

function loggedOutput(output: { mock: { calls: unknown[][] } }): string {
  return output.mock.calls.flat().join("\n");
}

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
