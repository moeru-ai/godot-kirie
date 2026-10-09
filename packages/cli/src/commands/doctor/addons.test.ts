import type { KirieGodotAddonDependency } from "../../plugin/index.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { checkGodotAddon, installGodotAddon } from "./addons.ts";

const ADDON_VERSION = "1.0.0";
const ARCHIVE_SHA256 = "fixture checksum";
const NATIVE_SHA256 = "native checksum";
const tempDirs: string[] = [];
const packageAddon: KirieGodotAddonDependency = {
  id: "example",
  path: "addons/example",
  requiredFiles: ["plugin.cfg", "plugin.gd"],
  source: { type: "package", url: pathToFileURL(path.join(os.tmpdir(), "unused")).href },
  version: ADDON_VERSION,
};
const archiveAddon: KirieGodotAddonDependency = {
  ...packageAddon,
  source: {
    archivePath: "addons/example",
    sha256: ARCHIVE_SHA256,
    type: "archive",
    url: "https://example.com/example-addon.zip",
  },
};
const nativeAddon: KirieGodotAddonDependency = {
  id: "native",
  path: "addons/native",
  requiredFiles: ["native.gdextension"],
  source: {
    archivePath: "dist/addons/native",
    sha256: NATIVE_SHA256,
    type: "archive",
    url: "https://example.com/native-addon.zip",
  },
  version: "2.0.0",
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })),
  );
});

describe("godot addon dependencies", () => {
  it("replaces an addon with a mismatched version", async () => {
    const project = await createProject();
    await writeScriptAddon(project, "0.0.0");
    await fs.writeFile(path.join(project, "addons", "example", "obsolete.gd"), "old release");

    await expect(checkGodotAddon(project, packageAddon)).resolves.toMatchObject({
      installed: true,
      valid: false,
    });

    const archive = Buffer.from("addon archive fixture");
    await installGodotAddon({
      addon: archiveAddon,
      projectDir: project,
      download: async (options) => {
        expect(options.url).toBe("https://example.com/example-addon.zip");
        await fs.writeFile(options.outputPath, archive);
      },
      extractArchive: async (archivePath, outputDir) => {
        await expect(fs.readFile(archivePath)).resolves.toEqual(archive);
        await writeScriptAddon(outputDir, ADDON_VERSION);
      },
    });

    await expect(checkGodotAddon(project, archiveAddon)).resolves.toMatchObject({ valid: true });
    await expect(fs.stat(path.join(project, "addons", "example", "obsolete.gd")))
      .rejects
      .toMatchObject({ code: "ENOENT" });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it("skips the download when the installed addon matches", async () => {
    const project = await createProject();
    await writeScriptAddon(project, ADDON_VERSION);
    const checksumDir = path.join(project, ".godot", "kirie");
    await fs.mkdir(checksumDir, { recursive: true });
    await fs.writeFile(path.join(checksumDir, "example.sha256"), `${ARCHIVE_SHA256}\n`);

    await installGodotAddon({
      addon: archiveAddon,
      projectDir: project,
      download: async () => { throw new Error("Matching installations must be reused"); },
    });
  });

  it("reports an incomplete installation even when its version matches", async () => {
    const project = await createProject();
    await writeScriptAddon(project, ADDON_VERSION);
    await fs.rm(path.join(project, "addons", "example", "plugin.gd"));

    await expect(checkGodotAddon(project, packageAddon)).resolves.toMatchObject({ valid: false });
  });

  it("copies an addon bundled in a plugin package", async () => {
    const project = await createProject();
    const packageRoot = await createTempDir("kirie-package-addon-");
    await writeScriptAddon(packageRoot, ADDON_VERSION);
    const addon = {
      ...packageAddon,
      source: {
        type: "package" as const,
        url: pathToFileURL(path.join(packageRoot, "addons", "example")).href,
      },
    };

    await installGodotAddon({ addon, projectDir: project });

    await expect(checkGodotAddon(project, addon)).resolves.toMatchObject({ valid: true });
  });

  it("installs and recognizes a pinned native archive", async () => {
    const project = await createProject();
    const archive = Buffer.from("native archive fixture");

    await installGodotAddon({
      addon: nativeAddon,
      download: async (options) => {
        expect(options.expectedSha256).toBe(NATIVE_SHA256);
        await fs.writeFile(options.outputPath, archive);
      },
      extractArchive: async (archivePath, outputDir) => {
        await expect(fs.readFile(archivePath)).resolves.toEqual(archive);
        const extractedAddon = path.join(outputDir, "dist", "addons", "native");
        await fs.mkdir(extractedAddon, { recursive: true });
        await fs.writeFile(path.join(extractedAddon, "native.gdextension"), "[configuration]\n");
      },
      projectDir: project,
    });

    await expect(checkGodotAddon(project, nativeAddon)).resolves.toMatchObject({ valid: true });
    await installGodotAddon({
      addon: nativeAddon,
      download: async () => {
        throw new Error("An installed matching release must not be downloaded again");
      },
      projectDir: project,
    });
    await expect(listAddonStagingDirs(project)).resolves.toEqual([]);
  });

  it("rejects an installed archive with a different checksum", async () => {
    const project = await createProject();
    const addonDir = path.join(project, "addons", "native");
    const checksumDir = path.join(project, ".godot", "kirie");
    await fs.mkdir(addonDir, { recursive: true });
    await fs.mkdir(checksumDir, { recursive: true });
    await fs.writeFile(path.join(addonDir, "native.gdextension"), "[configuration]\n");
    await fs.writeFile(path.join(checksumDir, "native.sha256"), "different checksum\n");

    await expect(checkGodotAddon(project, nativeAddon)).resolves.toMatchObject({
      message: expect.stringContaining("does not match 2.0.0"),
      valid: false,
    });
  });
});

async function createProject(): Promise<string> {
  const project = await createTempDir("kirie-addon-doctor-");
  await fs.writeFile(path.join(project, "project.godot"), "[application]\n");
  return project;
}

async function createTempDir(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

async function writeScriptAddon(root: string, version: string): Promise<void> {
  const directory = path.join(root, "addons", "example");
  await fs.rm(directory, { force: true, recursive: true });
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "plugin.cfg"),
    `[plugin]\nversion="${version}"\nscript="plugin.gd"\n`,
  );
  await fs.writeFile(path.join(directory, "plugin.gd"), "extends RefCounted\n");
}

async function listAddonStagingDirs(project: string): Promise<string[]> {
  const projectParent = await fs.readdir(path.dirname(project));
  return projectParent.filter((entry) => entry.startsWith(".kirie-addon-stage-"));
}
