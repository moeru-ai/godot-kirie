import { describe, expect, it } from "vitest";

import { checkDotnetPackage, installDotnetPackage } from "./dotnet.ts";

const dependency = { id: "Example.Package", version: "2.0.0" };

describe("dotnet package doctor support", () => {
  it("reads a centrally managed package version from evaluated MSBuild items", async () => {
    const result = await checkDotnetPackage({
      dependency,
      projectDir: "/project",
      runDotnet: async (args, cwd) => {
        expect(args).toEqual([
          "msbuild",
          "app.csproj",
          "-getItem:PackageReference,PackageVersion",
        ]);
        expect(cwd).toBe("/project");
        return JSON.stringify({
          Items: {
            PackageReference: [{ Identity: "example.package" }],
            PackageVersion: [{ Identity: "Example.Package", Version: "2.0.0" }],
          },
        });
      },
      csproj: "app.csproj",
    });

    expect(result).toEqual({ installed: true, version: "2.0.0" });
  });

  it("delegates package updates to the dotnet CLI", async () => {
    let invocation: { args: string[]; cwd: string } | undefined;

    await installDotnetPackage({
      dependency,
      projectDir: "/project",
      runDotnet: async (args, cwd) => {
        invocation = { args, cwd };
        return "";
      },
      csproj: "app.csproj",
    });

    expect(invocation).toEqual({
      args: [
        "package",
        "add",
        "Example.Package",
        "--version",
        "2.0.0",
        "--project",
        "app.csproj",
      ],
      cwd: "/project",
    });
  });
});
