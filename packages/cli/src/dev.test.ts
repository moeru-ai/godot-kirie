import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import fakeGodotSource from "../test-fixtures/fake-godot.js?raw";
import { runDev } from "./dev.ts";
import { copyBasicKirieCliExample } from "./test-project.ts";

const FAKE_GODOT_INVOCATIONS_FILE = "godot-invocations.json";
const testProjects: string[] = [];

afterEach(async () => {
  await Promise.all(
    testProjects.splice(0).map((project) => fs.rm(project, { force: true, recursive: true })),
  );
});

describe("runDev", () => {
  it("starts Vite and launches Godot with the resolved dev URL", async () => {
    const project = await copyExampleProject();

    await installFakeGodot(project);
    await writeConfig(
      project,
      `{
  godot: {
    command: process.execPath,
    args: ["fake-godot.js"],
  },
  web: {
    vite: {
      logLevel: "silent",
    },
  },
}
`,
    );

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
    const project = await copyExampleProject();
    await writeConfig(
      project,
      `{
  web: {
    vite: {
      server: {
        port: 4321,
      },
    },
  },
}
`,
    );

    await expect(
      runDev({
        cwd: project,
      }),
    ).rejects.toThrow("web.vite.server.port is owned by Kirie");
  });

  it("fails clearly when src-web/index.html is missing", async () => {
    const project = await copyExampleProject();
    await fs.rm(path.join(project, "src-web", "index.html"));
    await writeConfig(
      project,
      `{
  web: {
    vite: {
      logLevel: "silent",
    },
  },
}
`,
    );

    await expect(
      runDev({
        cwd: project,
      }),
    ).rejects.toThrow(/Kirie dev requires .*index\.html/);
  });
});

async function copyExampleProject(): Promise<string> {
  const project = await copyBasicKirieCliExample("kirie-cli-dev-");
  testProjects.push(project);

  return project;
}

async function writeConfig(project: string, content: string): Promise<void> {
  await fs.writeFile(path.join(project, "kirie.config.ts"), `export default ${content};\n`);
}

async function installFakeGodot(project: string): Promise<void> {
  await fs.writeFile(path.join(project, "fake-godot.js"), fakeGodotSource);
}

interface GodotInvocation {
  argv: string[];
  cwd: string;
  env: {
    KIRIE_DEV?: string;
    KIRIE_WEB_URL?: string;
  };
}

async function readFakeGodotInvocations(
  project: string,
): Promise<[GodotInvocation, GodotInvocation]> {
  const invocationsFile = path.join(project, FAKE_GODOT_INVOCATIONS_FILE);
  const invocations = JSON.parse(await fs.readFile(invocationsFile, "utf8")) as GodotInvocation[];

  expect(invocations).toHaveLength(2);
  return invocations as [GodotInvocation, GodotInvocation];
}
