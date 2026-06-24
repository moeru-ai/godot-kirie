import { type CommandDef, defineCommand } from "citty";

import packageJson from "../package.json" with { type: "json" };
import { runBuild, runBuildDotnet, runBuildWeb } from "./build.ts";
import { type DevTarget, runDev } from "./dev.ts";
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

const projectArgs = {
  project: { description: "Godot project directory.", type: "string" },
} as const;

const devServerArgs = {
  "clear-screen": { description: "Allow Vite to clear the terminal.", type: "boolean" },
  force: { description: "Force Vite dependency pre-bundling.", type: "boolean" },
  host: { description: "Vite dev server host override.", type: "string" },
  "log-level": { description: "Vite log level: info, warn, error, or silent.", type: "string" },
  mode: { description: "Vite mode.", type: "string" },
  "no-clear-screen": { description: "Prevent Vite from clearing the terminal.", type: "boolean" },
  port: { description: "Vite dev server port override.", type: "string" },
  "strict-port": {
    description: "Fail if the requested Vite port is unavailable.",
    type: "boolean",
  },
} as const;

const mobileDeviceArgs = {
  device: { description: "Target device or simulator selector.", type: "string" },
} as const;

const androidLaunchArgs = {
  ...mobileDeviceArgs,
  "clear-data": { description: "Clear Android app data before launch.", type: "boolean" },
  "clear-logcat": { description: "Clear Android logcat before launch.", type: "boolean" },
  "force-stop": { description: "Force-stop the Android app before launch.", type: "boolean" },
} as const;

const androidRunArgs = {
  ...projectArgs,
  ...androidLaunchArgs,
  "launch-option": { description: "Launch option as key=value.", type: "string" },
  "no-logcat": { description: "Do not attach Android logcat after launch.", type: "boolean" },
} as const;

const devArgs = {
  ...projectArgs,
  ...devServerArgs,
  godot: { description: "Godot executable override.", type: "string" },
} as const;

const androidDevArgs = {
  ...devArgs,
  ...androidLaunchArgs,
} as const;

const iosSimulatorLaunchArgs = {
  ...mobileDeviceArgs,
  "terminate-existing": {
    description: "Terminate the iOS simulator app before launch.",
    type: "boolean",
  },
} as const;

const iosRunArgs = {
  ...projectArgs,
  ...iosSimulatorLaunchArgs,
  app: { description: "iOS .app path to install before launch.", type: "string" },
  "launch-option": { description: "Launch option as key=value.", type: "string" },
} as const;

const iosDevArgs = {
  ...devArgs,
  ...iosSimulatorLaunchArgs,
  app: { description: "iOS simulator .app output path.", type: "string" },
} as const;

type ExportCommandArgs = CommandArgs<typeof exportArgs>;
type DevCommandArgs = CommandArgs<typeof devArgs> &
  CommandArgs<typeof androidDevArgs> &
  CommandArgs<typeof iosDevArgs>;
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

function runDevCommand(target: DevTarget) {
  return ({ args, rawArgs }: { args: DevCommandArgs; rawArgs: string[] }) =>
    runDev({
      appPath: args.app,
      clearData: args["clear-data"],
      clearLogcat: args["clear-logcat"],
      clearScreen: resolveClearScreen(args),
      cwd: args.project,
      device: args.device,
      force: args.force,
      forceStop: args["force-stop"],
      godotArgs: target === "desktop" ? parseUserArgs(rawArgs) : undefined,
      godotCommand: args.godot,
      host: args.host,
      logLevel: parseLogLevel(args["log-level"]),
      mode: args.mode,
      port: parsePort(args.port),
      strictPort: args["strict-port"],
      target,
      terminateExisting: args["terminate-existing"],
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

function parseLogLevel(
  rawLogLevel: string | undefined,
): "info" | "warn" | "error" | "silent" | undefined {
  if (!rawLogLevel) {
    return undefined;
  }
  if (
    rawLogLevel === "info" ||
    rawLogLevel === "warn" ||
    rawLogLevel === "error" ||
    rawLogLevel === "silent"
  ) {
    return rawLogLevel;
  }

  throw new Error("Vite log level must be info, warn, error, or silent.");
}

function parsePort(rawPort: string | undefined): number | undefined {
  if (!rawPort) {
    return undefined;
  }

  const port = Number(rawPort);
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }

  throw new Error("Vite port must be an integer from 1 to 65535.");
}

function resolveClearScreen(args: DevCommandArgs): boolean | undefined {
  if (args["no-clear-screen"]) {
    return false;
  }
  if (args["clear-screen"]) {
    return true;
  }

  return undefined;
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
      args: devArgs,
      default: "desktop",
      meta: { description: "Start Vite and launch Godot for development.", name: "dev" },
      subCommands: {
        android: defineCommand({
          args: androidDevArgs,
          meta: {
            description: "Export, install, and launch Android with Vite dev.",
            name: "android",
          },
          run: runDevCommand("android"),
        }),
        desktop: defineCommand({
          args: devArgs,
          meta: {
            description: "Start Vite and launch Godot for desktop development.",
            name: "desktop",
          },
          run: runDevCommand("desktop"),
        }),
        ios: defineCommand({
          args: iosDevArgs,
          meta: {
            description: "Export, install, and launch an iOS simulator with Vite dev.",
            name: "ios",
          },
          run: runDevCommand("ios"),
        }),
      },
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
