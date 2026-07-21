import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyProjectName } from "./init.ts";

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

describe("applyProjectName", () => {
  it("updates the package name and HTML title", async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "kirie-init-test-"));
    temporaryDirectories.push(project);

    await fs.mkdir(path.join(project, "src-web"));
    await fs.writeFile(
      path.join(project, "package.json"),
      `${JSON.stringify({ name: "template-name", private: true }, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(project, "src-web", "index.html"),
      "<!doctype html><html><head><title>Template Name</title></head></html>\n",
    );

    await applyProjectName(project, "My Kirie App");

    const packageJson = JSON.parse(await fs.readFile(path.join(project, "package.json"), "utf8"));
    expect(packageJson).toEqual({ name: "my-kirie-app", private: true });
    await expect(
      fs.readFile(path.join(project, "src-web", "index.html"), "utf8"),
    ).resolves.toContain("<title>My Kirie App</title>");
  });
});
