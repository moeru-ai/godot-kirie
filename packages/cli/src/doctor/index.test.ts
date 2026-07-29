import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import axios, { type AxiosResponse } from "axios";
import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBasicKirieCliProjectTracker,
  installGodotCefFixture,
  installKirieConfigFixture,
  installProjectFixture,
} from "../test-project.ts";
import { installGodotCef } from "./godot-cef.ts";
import {
  checkAndroidSdk,
  checkGodotCefPrerequisite,
  checkGodotCommand,
  checkGodotExportTemplates,
  DoctorCheckStatus,
} from "./index.ts";

const cliPath = fileURLToPath(import.meta.resolve("../cli.ts"));
const projects = createBasicKirieCliProjectTracker("kirie-cli-doctor-");
const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    projects.cleanup(),
    ...tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })),
  ]);
});

describe("doctor command", () => {
  it("checks Godot export templates and the Android SDK from the CLI", async () => {
    const project = await projects.copy();
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
  });

  it("checks only a selected doctor target", async () => {
    const project = await projects.copy();

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
    expect(result.stdout).toContain("ok Godot CEF:");
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

  it("reports an installed addon as available", async () => {
    const project = await projects.copy();
    const addonDir = path.join(project, "addons", "godot_cef");
    await fs.mkdir(addonDir, { recursive: true });
    await fs.writeFile(path.join(addonDir, "godot_cef.gdextension"), "[configuration]\n");

    await expect(checkGodotCefPrerequisite(project)).resolves.toMatchObject({
      name: "Godot CEF",
      status: DoctorCheckStatus.Ok,
    });
  });

  it("rejects an incomplete addon instead of replacing it", async () => {
    const project = await projects.copy();
    const addonDir = path.join(project, "addons", "godot_cef");
    await fs.mkdir(addonDir, { recursive: true });

    await expect(installGodotCef({ projectDir: project })).rejects.toThrow(
      "Refusing to replace an unrecognized Godot CEF installation",
    );
  });

  it("streams, checksums, and stages a valid addon download", async () => {
    const project = await projects.copy();
    const archive = Buffer.from("tiny Godot CEF archive fixture");
    await installGodotCefConfig(project, crypto.createHash("sha256").update(archive).digest("hex"));

    const progress: string[] = [];
    vi.spyOn(axios, "get").mockImplementation(async (_url, config) => {
      config?.onDownloadProgress?.({
        bytes: archive.byteLength,
        download: true,
        estimated: 0,
        lengthComputable: true,
        loaded: archive.byteLength,
        progress: 1,
        rate: archive.byteLength,
        total: archive.byteLength,
      });
      return {
        data: Readable.from([archive.subarray(0, 7), archive.subarray(7)]),
      } as AxiosResponse<Readable>;
    });
    await installGodotCef({
      extractArchive: async (archivePath, outputDir) => {
        await expect(fs.readFile(archivePath)).resolves.toEqual(archive);
        const extractedAddon = path.join(outputDir, "dist", "addons", "godot_cef");
        await fs.mkdir(extractedAddon, { recursive: true });
        await fs.writeFile(path.join(extractedAddon, "godot_cef.gdextension"), "[configuration]\n");
      },
      output: {
        columns: 120,
        isTTY: true,
        write: (text) => progress.push(text),
      },
      projectDir: project,
    });

    await expect(
      fs.stat(path.join(project, "addons", "godot_cef", "godot_cef.gdextension")),
    ).resolves.toBeDefined();
    expect(progress.join("")).toContain("100.0%");
    expect(progress.join("")).toContain("MiB/s");
    await expect(listGodotCefStagingDirs(project)).resolves.toEqual([]);
  });

  it("leaves no addon or staging directory after a checksum failure", async () => {
    const project = await projects.copy();
    await installGodotCefConfig(project, "0".repeat(64));
    vi.spyOn(axios, "get").mockResolvedValue({
      data: Readable.from("unexpected bytes"),
    } as AxiosResponse<Readable>);

    await expect(
      installGodotCef({
        output: { isTTY: false, write: () => true },
        projectDir: project,
      }),
    ).rejects.toThrow("Godot CEF checksum mismatch");

    await expect(fs.stat(path.join(project, "addons", "godot_cef"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(listGodotCefStagingDirs(project)).resolves.toEqual([]);
  });

  it("does not install an archive with the wrong layout", async () => {
    const project = await projects.copy();
    const archive = Buffer.from("valid checksum, invalid layout");
    await installGodotCefConfig(project, crypto.createHash("sha256").update(archive).digest("hex"));
    vi.spyOn(axios, "get").mockResolvedValue({
      data: Readable.from(archive),
    } as AxiosResponse<Readable>);

    await expect(
      installGodotCef({
        extractArchive: async (_archivePath, outputDir) => {
          await fs.mkdir(path.join(outputDir, "unexpected"), { recursive: true });
        },
        output: { isTTY: false, write: () => true },
        projectDir: project,
      }),
    ).rejects.toThrow("Godot CEF archive does not contain dist/addons/godot_cef");

    await expect(fs.stat(path.join(project, "addons", "godot_cef"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(listGodotCefStagingDirs(project)).resolves.toEqual([]);
  });
});

describe("checkAndroidSdk", () => {
  it("passes when ANDROID_HOME points at an existing SDK directory", async () => {
    const sdk = await createTempDir("kirie-android-sdk-");

    const check = await checkAndroidSdk({
      env: { ANDROID_HOME: sdk },
    });

    expect(check).toMatchObject({
      message: `ANDROID_HOME=${sdk}`,
      name: "Android SDK",
      status: "ok",
    });
  });

  it("fails when no Android SDK environment variable is configured", async () => {
    const check = await checkAndroidSdk({
      env: {},
    });

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

async function installGodotCefConfig(project: string, sha256: string): Promise<void> {
  const kirieAddon = path.join(project, "addons", "kirie");
  await fs.rm(kirieAddon, { force: true, recursive: true });
  await fs.mkdir(kirieAddon, { recursive: true });
  await fs.writeFile(
    path.join(kirieAddon, "godot_cef.json"),
    `${JSON.stringify({
      addon_path: "res://addons/godot_cef",
      class_name: "CefTexture",
      sha256,
      version: "test",
    })}\n`,
  );
}

async function listGodotCefStagingDirs(project: string): Promise<string[]> {
  const projectParent = await fs.readdir(path.dirname(project));
  return projectParent.filter((entry) => entry.startsWith(".kirie-godot-cef-stage-"));
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
