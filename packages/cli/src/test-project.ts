import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const basicKirieCliExample = fileURLToPath(
  import.meta.resolve("../../../examples/basic-kirie-cli"),
);
const cliTestFixturesDir = fileURLToPath(import.meta.resolve("../test-fixtures"));
const repositoryTmpDir = fileURLToPath(import.meta.resolve("../../../.tmp"));
const ignoredExampleCopyRoots = [".godot", "addons/godot_cef", "node_modules", "src-web/dist"];

export async function copyBasicKirieCliExample(prefix: string): Promise<string> {
  await fs.mkdir(repositoryTmpDir, { recursive: true });
  const project = await fs.mkdtemp(path.join(repositoryTmpDir, prefix));
  await fs.cp(basicKirieCliExample, project, {
    filter: shouldCopyExamplePath,
    recursive: true,
  });
  await fs.symlink(
    path.join(basicKirieCliExample, "node_modules"),
    path.join(project, "node_modules"),
    "dir",
  );

  return project;
}

export function createBasicKirieCliProjectTracker(prefix: string): {
  cleanup: () => Promise<void>;
  copy: () => Promise<string>;
} {
  const projects: string[] = [];

  return {
    async copy() {
      const project = await copyBasicKirieCliExample(prefix);
      projects.push(project);
      return project;
    },
    async cleanup() {
      await Promise.all(
        projects.splice(0).map((project) => fs.rm(project, { force: true, recursive: true })),
      );
    },
  };
}

export async function installKirieConfigFixture(
  project: string,
  fixtureName: string,
): Promise<void> {
  await installProjectFixture(project, fixtureName, "kirie.config.ts");
}

export async function installProjectFixture(
  project: string,
  fixtureName: string,
  outputName: string = fixtureName,
): Promise<void> {
  await fs.copyFile(path.join(cliTestFixturesDir, fixtureName), path.join(project, outputName));
}

function shouldCopyExamplePath(entry: string): boolean {
  const relativePath = path.relative(basicKirieCliExample, entry).split(path.sep).join("/");

  if (relativePath === "") {
    return true;
  }

  return !ignoredExampleCopyRoots.some(
    (ignoredRoot) => relativePath === ignoredRoot || relativePath.startsWith(`${ignoredRoot}/`),
  );
}
