import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { strToU8, zipSync } from "fflate";
import type { DownloadTemplateOptions } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installAddonArchive, KIRIE_TEMPLATES_COMMIT, runInit } from "./init.ts";

const { downloadTemplateMock } = vi.hoisted(() => ({
  downloadTemplateMock: vi.fn(),
}));

vi.mock("giget", () => ({
  downloadTemplate: downloadTemplateMock,
}));

const temporaryDirectories: string[] = [];

beforeEach(() => {
  downloadTemplateMock.mockReset();
});

afterEach(async () => {
  vi.unstubAllGlobals();
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
    expect(downloadTemplateMock).not.toHaveBeenCalled();
  });

  it("downloads one pinned template and installs the addon before applying project names", async () => {
    const root = await createTemporaryDirectory();
    downloadTemplateMock.mockImplementation(
      async (_source: string, options: DownloadTemplateOptions) => {
        if (!options.dir) {
          throw new Error("Missing template destination.");
        }

        await fs.mkdir(path.join(options.dir, "src-web"), { recursive: true });
        await fs.mkdir(path.join(options.dir, "addons", "kirie"), { recursive: true });
        await fs.writeFile(
          path.join(options.dir, "package.json"),
          `${JSON.stringify({ name: "template-name", private: true }, null, 2)}\n`,
        );
        await fs.writeFile(
          path.join(options.dir, "project.godot"),
          '[application]\nconfig/name="Template Name"\n',
        );
        await fs.writeFile(
          path.join(options.dir, "src-web", "index.html"),
          "<!doctype html><html><head><title>Template Name</title></head></html>\n",
        );
        await fs.writeFile(path.join(options.dir, "addons", "kirie", "stale.txt"), "stale");
      },
    );

    const addonArchive = zipSync({
      "addons/kirie/gd_kirie.gd": strToU8("extends RefCounted\n"),
      "addons/kirie/plugin.cfg": strToU8('[plugin]\nname="Kirie"\n'),
    });
    const fetchMock = vi.fn(async () => ({
      arrayBuffer: async () => addonArchive.buffer,
      ok: true,
      status: 200,
      statusText: "OK",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await runInit({
      cwd: root,
      target: "My Kirie App",
      template: "basic",
    });

    expect(downloadTemplateMock).toHaveBeenCalledWith(
      `github:moeru-ai/kirie-templates/templates/basic#${KIRIE_TEMPLATES_COMMIT}`,
      {
        dir: expect.stringContaining(".kirie-init-"),
        registry: false,
      },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/moeru-ai/godot-kirie/releases/download/v0.1.2/kirie-addon.zip",
    );

    const project = path.join(root, "My Kirie App");
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
  });

  it("rejects template folder traversal before downloading", async () => {
    const root = await createTemporaryDirectory();

    await expect(
      runInit({
        cwd: root,
        target: "project",
        template: "../basic",
      }),
    ).rejects.toThrow("Template must be a single folder name.");
    expect(downloadTemplateMock).not.toHaveBeenCalled();
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
