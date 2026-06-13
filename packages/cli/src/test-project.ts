import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const basicKirieCliExample = fileURLToPath(
  import.meta.resolve("../../../examples/basic-kirie-cli"),
);
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

function shouldCopyExamplePath(entry: string): boolean {
  const relativePath = path.relative(basicKirieCliExample, entry).split(path.sep).join("/");

  if (relativePath === "") {
    return true;
  }

  for (const ignoredRoot of ignoredExampleCopyRoots) {
    if (relativePath === ignoredRoot || relativePath.startsWith(`${ignoredRoot}/`)) {
      return false;
    }
  }

  return true;
}
