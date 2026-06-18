import { type Options as ExecaOptions, execa } from "execa";

const DOTNET_NO_PROJECT_ERROR = "MSB1003";

export interface BuildDotnetOptions {
  projectDir: string;
  skipMissingProject?: boolean;
  stdio?: ExecaOptions["stdio"];
}

export async function buildDotnet(options: BuildDotnetOptions): Promise<void> {
  const result = await execa("dotnet", ["build"], {
    all: true,
    cwd: options.projectDir,
    reject: false,
    stdio: options.stdio,
  });
  const output = typeof result.all === "string" ? result.all : "";

  if (result.exitCode === 0) {
    if (options.stdio === undefined) {
      process.stdout.write(output);
    }
    return;
  }

  if (options.skipMissingProject && output.includes(DOTNET_NO_PROJECT_ERROR)) {
    console.log("No .NET project found; skipping dotnet build.");
    return;
  }

  if (options.stdio === undefined) {
    process.stdout.write(output);
  }
  throw new Error("dotnet build failed.");
}
