import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runDev } from "./dev.ts";
import {
  createBasicKirieCliProjectTracker,
  installKirieConfigFixture,
  installProjectFixture,
} from "./test-project.ts";

const FAKE_GODOT_INVOCATIONS_FILE = "godot-invocations.json";
const projects = createBasicKirieCliProjectTracker("kirie-cli-dev-");

interface GodotInvocation {
  argv: string[];
  cwd: string;
  env: { KIRIE_DEV?: string; KIRIE_WEB_URL?: string };
}

afterEach(async () => {
  await projects.cleanup();
});

describe("runDev", () => {
  it("starts Vite and launches Godot with the resolved dev URL", async () => {
    const project = await projects.copy();

    await installProjectFixture(project, "fake-godot.js");
    await installKirieConfigFixture(project, "dev-fake-godot.kirie.config.ts");

    await runDev({
      cwd: project,
    });

    const realProject = await fs.realpath(project);
    const [prepareRun, devRun] = await readFakeGodotInvocations(project);

    expect(prepareRun).toMatchObject({
      argv: ["--headless", "--path", project, "--import"],
      cwd: realProject,
      env: {},
    });
    expect(devRun).toMatchObject({
      argv: ["--path", project],
      cwd: realProject,
      env: {
        KIRIE_DEV: "1",
      },
    });
    expect(devRun?.env.KIRIE_WEB_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("rejects Kirie-owned Vite options", async () => {
    const project = await projects.copy();
    await installKirieConfigFixture(project, "dev-owned-server-port.kirie.config.ts");

    await expect(
      runDev({
        cwd: project,
      }),
    ).rejects.toThrow("web.vite.server.port is owned by Kirie");
  });

  it("fails clearly when src-web/index.html is missing", async () => {
    const project = await projects.copy();
    await fs.rm(path.join(project, "src-web", "index.html"));
    await installKirieConfigFixture(project, "dev-log-silent.kirie.config.ts");

    await expect(
      runDev({
        cwd: project,
      }),
    ).rejects.toThrow(/Kirie dev requires .*index\.html/);
  });
});

async function readFakeGodotInvocations(
  project: string,
): Promise<[GodotInvocation, GodotInvocation]> {
  const invocationsFile = path.join(project, FAKE_GODOT_INVOCATIONS_FILE);
  const invocations = JSON.parse(await fs.readFile(invocationsFile, "utf8")) as GodotInvocation[];

  expect(invocations).toHaveLength(2);
  return invocations as [GodotInvocation, GodotInvocation];
}
