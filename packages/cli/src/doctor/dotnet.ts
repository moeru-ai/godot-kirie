import type { KirieDotnetPackageDependency } from "../plugin.ts";

import { execa } from "execa";

interface MsbuildItem {
  Identity: string;
  Version?: string;
  VersionOverride?: string;
}

interface MsbuildItems {
  Items?: {
    PackageReference?: MsbuildItem[];
    PackageVersion?: MsbuildItem[];
  };
}

export interface DotnetPackageOptions {
  csproj?: string;
  dependency: KirieDotnetPackageDependency;
  projectDir: string;
  runDotnet?: (args: string[], cwd: string) => Promise<string>;
}

export async function getDotnetPackageVersion(
  options: DotnetPackageOptions,
): Promise<string | undefined> {
  const args = [
    "msbuild",
    ...(options.csproj ? [options.csproj] : []),
    "-getItem:PackageReference,PackageVersion",
  ];
  const output = await (options.runDotnet ?? runDotnet)(args, options.projectDir);
  const items = (JSON.parse(output) as MsbuildItems).Items ?? {};
  const reference = items.PackageReference?.find(
    (item) => item.Identity.toLowerCase() === options.dependency.id.toLowerCase(),
  );
  if (!reference) {
    return undefined;
  }

  const centralVersion = items.PackageVersion?.find(
    (item) => item.Identity.toLowerCase() === options.dependency.id.toLowerCase(),
  );
  return reference.VersionOverride ?? reference.Version ?? centralVersion?.Version;
}

export async function installDotnetPackage(options: DotnetPackageOptions): Promise<void> {
  const args = [
    "package",
    "add",
    options.dependency.id,
    "--version",
    options.dependency.version,
    ...(options.csproj ? ["--project", options.csproj] : []),
  ];
  await (options.runDotnet ?? runDotnet)(args, options.projectDir);
}

async function runDotnet(args: string[], cwd: string): Promise<string> {
  const result = await execa("dotnet", args, { cwd });
  return result.stdout;
}
