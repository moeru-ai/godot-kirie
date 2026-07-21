import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";

import { applyProjectName, installAddonArchive, installTemplateArchive, runInit } from "./init.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("init command", () => {
  it("keeps an existing target when overwrite is not enabled", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "existing-project");
    const marker = path.join(target, "keep.txt");
    await fs.mkdir(target);
    await fs.writeFile(marker, "keep");

    await expect(
      runInit({
        cwd: root,
        target: "existing-project",
        template: "basic",
      }),
    ).rejects.toThrow("Target directory already exists");
    await expect(fs.readFile(marker, "utf8")).resolves.toBe("keep");
  });

  it("installs one template and the addon before applying targeted project names", async () => {
    const root = await createTemporaryDirectory();
    const project = path.join(root, "project");
    await fs.mkdir(path.join(project, "addons", "kirie"), { recursive: true });
    await fs.writeFile(path.join(project, "addons", "kirie", "stale.txt"), "stale");

    const templateArchive = zipSync({
      "kirie-templates-commit/templates/basic/package.json": strToU8(
        `${JSON.stringify({ name: "template-name", private: true }, null, 2)}\n`,
      ),
      "kirie-templates-commit/templates/basic/project.godot": strToU8(
        '[application]\nconfig/name="Template Name"\n',
      ),
      "kirie-templates-commit/templates/basic/src-web/index.html": strToU8(
        "<!doctype html><html><head><title>Template Name</title></head></html>\n",
      ),
      "kirie-templates-commit/templates/other/ignored.txt": strToU8("ignored"),
    });
    const addonArchive = zipSync({
      "addons/kirie/gd_kirie.gd": strToU8("extends RefCounted\n"),
      "addons/kirie/plugin.cfg": strToU8('[plugin]\nname="Kirie"\n'),
    });

    await installTemplateArchive(templateArchive, "basic", project);
    await installAddonArchive(addonArchive, project);
    await applyProjectName(project, "My Kirie App");

    const packageJson = JSON.parse(await fs.readFile(path.join(project, "package.json"), "utf8"));
    expect(packageJson.name).toBe("my-kirie-app");
    await expect(
      fs.readFile(path.join(project, "src-web", "index.html"), "utf8"),
    ).resolves.toContain("<title>My Kirie App</title>");
    await expect(fs.readFile(path.join(project, "project.godot"), "utf8")).resolves.toContain(
      'config/name="Template Name"',
    );
    await expect(
      fs.readFile(path.join(project, "addons", "kirie", "plugin.cfg"), "utf8"),
    ).resolves.toContain('name="Kirie"');
    await expect(fs.access(path.join(project, "addons", "kirie", "stale.txt"))).rejects.toThrow();
    await expect(fs.access(path.join(project, "ignored.txt"))).rejects.toThrow();
  });

  it("rejects template folder traversal", async () => {
    const root = await createTemporaryDirectory();
    const archive = zipSync({
      "kirie-templates-commit/templates/basic/package.json": strToU8("{}\n"),
    });

    await expect(installTemplateArchive(archive, "../basic", root)).rejects.toThrow(
      "Template must be a single folder name.",
    );
  });

  it("rejects archive path traversal", async () => {
    const root = await createTemporaryDirectory();
    const archive = zipSync({
      "../addons/kirie/plugin.cfg": strToU8('[plugin]\nname="Kirie"\n'),
    });

    await expect(installAddonArchive(archive, root)).rejects.toThrow(
      "Archive contains an unsafe path",
    );
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kirie-init-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
