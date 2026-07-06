import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

import { checkAndroidSdk, checkGodotCommand, checkGodotExportTemplates } from "./doctor.ts";
import {
  createBasicKirieCliProjectTracker,
  installKirieConfigFixture,
  installProjectFixture,
} from "./test-project.ts";

const cliPath = fileURLToPath(import.meta.resolve("./cli.ts"));
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

    expect(result.stdout).toContain("OK Godot command: 4.5.stable");
    expect(result.stdout).toContain("OK Godot export templates:");
    expect(result.stdout).toContain(`OK Android SDK: ANDROID_HOME=${sdk}`);
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
