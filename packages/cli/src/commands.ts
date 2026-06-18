import { type CommandDef, defineCommand } from "citty";

import packageJson from "../package.json" with { type: "json" };
import { runBuild, runBuildDotnet, runBuildWeb } from "./build.ts";
import { runDev } from "./dev.ts";
import { type ExportPlatform, runExport } from "./export.ts";
import { runAndroid, runIosSimulator } from "./run.ts";

type CommandArgSchema = Record<string, { readonly type: "boolean" | "string" }>;
type CommandArgs<T extends CommandArgSchema> = {
  [K in keyof T]?: T[K]["type"] extends "boolean" ? boolean : string;
};

const exportArgs = {
  "no-build": { description: "Skip local input build before export.", type: "boolean" },
  output: { alias: "o", description: "Export output path.", type: "string" },
  project: { description: "Godot project directory.", type: "string" },
  preset: { description: "Godot export preset name.", type: "string" },
  release: { description: "Use Godot release export mode.", type: "boolean" },
} as const;

const androidRunArgs = {
  "clear-data": { description: "Clear Android app data before launch.", type: "boolean" },
  "clear-logcat": { description: "Clear Android logcat before launch.", type: "boolean" },
  device: { description: "Target device or simulator selector.", type: "string" },
  "force-stop": { description: "Force-stop the Android app before launch.", type: "boolean" },
  "launch-option": { description: "Launch option as key=value.", type: "string" },
  "no-logcat": { description: "Do not attach Android logcat after launch.", type: "boolean" },
  project: { description: "Godot project directory.", type: "string" },
} as const;

const iosRunArgs = {
  app: { description: "iOS .app path to install before launch.", type: "string" },
  device: { description: "Target simulator selector.", type: "string" },
  "launch-option": { description: "Launch option as key=value.", type: "string" },
  project: { description: "Godot project directory.", type: "string" },
  "terminate-existing": {
    description: "Terminate the iOS simulator app before launch.",
    type: "boolean",
  },
} as const;

type ExportCommandArgs = CommandArgs<typeof exportArgs>;
type RunCommandArgs = CommandArgs<typeof androidRunArgs> & CommandArgs<typeof iosRunArgs>;

function parseUserArgs(rawArgs: string[]): string[] {
  const separatorIndex = rawArgs.indexOf("--");
  if (separatorIndex < 0) {
    return [];
  }

  return rawArgs.slice(separatorIndex + 1);
}

function runExportCommand(platform: ExportPlatform) {
  return ({ args, rawArgs }: { args: ExportCommandArgs; rawArgs: string[] }) =>
    runExport({
      build: !args["no-build"],
      cwd: args.project,
      output: args.output,
      platform,
      preset: args.preset,
      release: args.release,
      userArgs: parseUserArgs(rawArgs),
    });
}

function parseLaunchOptions(rawOption: string | undefined): Record<string, string> {
  if (!rawOption) {
    return {};
  }

  const separatorIndex = rawOption.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error("Launch option must use key=value.");
  }

  return {
    [rawOption.slice(0, separatorIndex)]: rawOption.slice(separatorIndex + 1),
  };
}

export const mainCommand: CommandDef = defineCommand({
  meta: {
    description: "Kirie development tools.",
    name: "kirie",
    version: packageJson.version,
  },
  subCommands: {
    build: defineCommand({
      default: "all",
      meta: { description: "Build local Kirie project inputs.", name: "build" },
      subCommands: {
        all: defineCommand({
          meta: { hidden: true, name: "all" },
          run: () => runBuild(),
        }),
        dotnet: defineCommand({
          meta: { description: "Build the Godot C#/.NET project.", name: "dotnet" },
          run: () => runBuildDotnet(),
        }),
        web: defineCommand({
          meta: { description: "Build the Vite web output.", name: "web" },
          run: () => runBuildWeb(),
        }),
      },
    }),
    dev: defineCommand({
      meta: { description: "Start Vite and launch Godot for desktop development.", name: "dev" },
      run: () => runDev(),
    }),
    export: defineCommand({
      meta: { description: "Export a Kirie project through Godot.", name: "export" },
      subCommands: {
        android: defineCommand({
          args: exportArgs,
          meta: { description: "Export the Android Godot preset.", name: "android" },
          run: runExportCommand("android"),
        }),
        ios: defineCommand({
          args: exportArgs,
          meta: { description: "Export the iOS Godot preset.", name: "ios" },
          run: runExportCommand("ios"),
        }),
      },
    }),
    run: defineCommand({
      meta: { description: "Install and launch an exported Kirie app.", name: "run" },
      subCommands: {
        android: defineCommand({
          args: androidRunArgs,
          meta: { description: "Install and launch an Android export.", name: "android" },
          run: ({ args }: { args: RunCommandArgs }) =>
            runAndroid({
              attachLogcat: !args["no-logcat"],
              clearData: args["clear-data"],
              clearLogcat: args["clear-logcat"],
              cwd: args.project,
              device: args.device,
              forceStop: args["force-stop"],
              launchOptions: parseLaunchOptions(args["launch-option"]),
            }),
        }),
        ios: defineCommand({
          args: iosRunArgs,
          meta: { description: "Install and launch an iOS simulator export.", name: "ios" },
          run: ({ args }: { args: RunCommandArgs }) =>
            runIosSimulator({
              appPath: args.app,
              cwd: args.project,
              launchOptions: parseLaunchOptions(args["launch-option"]),
              simulatorId: args.device,
              terminateExisting: args["terminate-existing"],
            }),
        }),
      },
    }),
  },
});
