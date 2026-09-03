import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { downloadTemplate } from "giget";
import JSZip from "jszip";

import packageJson from "../package.json" with { type: "json" };

const KIRIE_TEMPLATES_REPOSITORY = "moeru-ai/kirie-templates";
const KIRIE_REPOSITORY = "moeru-ai/godot-kirie";
export const KIRIE_TEMPLATES_COMMIT = "f0dc158c8ee1f6316cc493dc0dd51a39de847892";

export interface InitOptions {
  cwd?: string;
  overwrite?: boolean;
  target: string;
  template: string;
}

export async function runInit(options: InitOptions): Promise<void> {
  const templatesCommit = KIRIE_TEMPLATES_COMMIT.trim();
  if (!templatesCommit) {
    throw new Error("Kirie templates commit is not configured for this release.");
  }
  if (!/^[0-9a-f]{40}$/i.test(templatesCommit)) {
    throw new Error("Kirie templates commit must be a full Git commit SHA.");
  }

  assertTemplateName(options.template);

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const target = path.resolve(cwd, options.target);
  const existingTarget = await inspectTarget(target, cwd, options.overwrite ?? false);
  const targetParent = path.dirname(target);
  await fs.mkdir(targetParent, { recursive: true });

  const temporaryRoot = await fs.mkdtemp(path.join(targetParent, ".kirie-init-"));
  const stagedProject = path.join(temporaryRoot, "project");

  try {
    await fs.mkdir(stagedProject);

    const templateSource = `github:${KIRIE_TEMPLATES_REPOSITORY}/templates/${options.template}#${templatesCommit}`;
    const addonUrl = `https://github.com/${KIRIE_REPOSITORY}/releases/download/v${packageJson.version}/kirie-addon.zip`;
    const [, addonArchive] = await Promise.all([
      downloadTemplate(templateSource, {
        dir: stagedProject,
        registry: false,
      }),
      downloadArchive(addonUrl, `Kirie addon v${packageJson.version}`),
    ]);

    await installAddonArchive(addonArchive, stagedProject);
    await applyProjectName(stagedProject, path.basename(target));
    await installStagedProject(stagedProject, target, temporaryRoot, existingTarget);
  } finally {
    await fs.rm(temporaryRoot, { force: true, recursive: true });
  }

  console.log(`Created Kirie project at ${target}`);
  console.log("\nNext steps:");
  console.log(`  cd ${target}`);
  console.log("  pnpm install");
  console.log("  pnpm kirie doctor");
}

export async function installAddonArchive(archive: Uint8Array, destination: string): Promise<void> {
  const zip = await JSZip.loadAsync(archive);
  const addonPrefix = "addons/kirie/";
  const addonFiles = Object.values(zip.files).filter(
    (file) => !file.dir && file.name.startsWith(addonPrefix),
  );

  if (!addonFiles.some((file) => file.name === `${addonPrefix}plugin.cfg`)) {
    throw new Error("Kirie addon archive does not contain addons/kirie/plugin.cfg.");
  }

  const addonDestination = path.join(destination, "addons", "kirie");
  await fs.rm(addonDestination, { force: true, recursive: true });

  for (const file of addonFiles) {
    const outputPath = path.join(addonDestination, file.name.slice(addonPrefix.length));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, await file.async("uint8array"));
  }
}

export async function applyProjectName(project: string, projectName: string): Promise<void> {
  const packageJsonPath = path.join(project, "package.json");
  const parsedPackageJson: unknown = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  if (
    !parsedPackageJson ||
    typeof parsedPackageJson !== "object" ||
    Array.isArray(parsedPackageJson)
  ) {
    throw new Error("Template package.json must contain a JSON object.");
  }

  const packageName = toValidPackageName(projectName);
  if (!packageName) {
    throw new Error(`Target directory "${projectName}" cannot produce a valid package name.`);
  }

  const packageRecord = parsedPackageJson as Record<string, unknown>;
  packageRecord.name = packageName;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageRecord, null, 2)}\n`);

  const indexPath = path.join(project, "src-web", "index.html");
  const indexHtml = await fs.readFile(indexPath, "utf8");
  if (!/<title>.*?<\/title>/s.test(indexHtml)) {
    throw new Error("Template src-web/index.html must contain a title element.");
  }

  const escapedProjectName = projectName
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  await fs.writeFile(
    indexPath,
    indexHtml.replace(/<title>.*?<\/title>/s, `<title>${escapedProjectName}</title>`),
  );
}

function assertTemplateName(template: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(template) || template === "." || template === "..") {
    throw new Error("Template must be a single folder name.");
  }
}

async function inspectTarget(target: string, cwd: string, overwrite: boolean): Promise<boolean> {
  if (target === path.parse(target).root) {
    throw new Error("Cannot initialize a Kirie project at a filesystem root.");
  }

  let stat: Stats;
  try {
    stat = await fs.lstat(target);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    throw new Error(`Target path is a symbolic link: ${target}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Target path is not a directory: ${target}`);
  }
  if (!overwrite) {
    throw new Error(`Target directory already exists: ${target}`);
  }
  if (target === cwd) {
    throw new Error("Cannot overwrite the current working directory.");
  }

  return true;
}

async function downloadArchive(url: string, description: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${description}: ${response.status} ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function installStagedProject(
  stagedProject: string,
  target: string,
  temporaryRoot: string,
  existingTarget: boolean,
): Promise<void> {
  const previousTarget = path.join(temporaryRoot, "previous");
  if (existingTarget) {
    await fs.rename(target, previousTarget);
  }

  try {
    await fs.rename(stagedProject, target);
  } catch (error) {
    if (existingTarget) {
      await fs.rename(previousTarget, target);
    }
    throw error;
  }
}

function toValidPackageName(projectName: string): string {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z\d\-~]+/g, "-");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
