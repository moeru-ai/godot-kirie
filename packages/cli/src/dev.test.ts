import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runDev } from "./dev";

const testProjects: string[] = [];

afterEach(async () => {
  await Promise.all(
    testProjects.splice(0).map((project) => fs.rm(project, { force: true, recursive: true })),
  );
});

describe("runDev", () => {
  it("starts Vite and launches Godot with the resolved dev URL", async () => {
    const project = await createProject();
    const captureFile = path.join(project, "godot-capture.json");

    await fs.writeFile(
      path.join(project, "fake-godot.mjs"),
      `import { writeFileSync } from "node:fs";

writeFileSync("godot-capture.json", JSON.stringify({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: {
    KIRIE_DEV: process.env.KIRIE_DEV,
    KIRIE_WEB_URL: process.env.KIRIE_WEB_URL,
  },
}));
`,
    );
    await writeConfig(
      project,
      `{
  godot: {
    command: process.execPath,
    args: ["fake-godot.mjs"],
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
    const capture = JSON.parse(await fs.readFile(captureFile, "utf8")) as {
      argv: string[];
      cwd: string;
      env: {
        KIRIE_DEV?: string;
        KIRIE_WEB_URL?: string;
      };
    };

    expect(capture.argv).toEqual(["--path", project]);
    expect(capture.cwd).toBe(realProject);
    expect(capture.env.KIRIE_DEV).toBe("1");
    expect(capture.env.KIRIE_WEB_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("rejects Kirie-owned Vite options", async () => {
    const project = await createProject();
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
    const project = await createProject({ index: false });
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

async function createProject(options: { index?: boolean } = {}): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "kirie-cli-"));
  testProjects.push(project);
  await fs.mkdir(path.join(project, "src-web"), { recursive: true });
  await fs.writeFile(path.join(project, "project.godot"), "");

  if (options.index ?? true) {
    await fs.writeFile(
      path.join(project, "src-web", "index.html"),
      '<main id="app">Kirie dev test</main>',
    );
  }

  return project;
}

async function writeConfig(project: string, content: string): Promise<void> {
  await fs.writeFile(path.join(project, "kirie.config.ts"), `export default ${content};\n`);
}
