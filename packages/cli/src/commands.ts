import { type CommandDef, defineCommand } from "citty";

import packageJson from "../package.json" with { type: "json" };
import { runBuild, runBuildDotnet, runBuildWeb } from "./build.ts";
import { runDev } from "./dev.ts";

export const mainCommand: CommandDef = defineCommand({
  meta: {
    description: "Kirie development tools.",
    name: "kirie",
    version: packageJson.version,
  },
  subCommands: {
    build: defineCommand({
      default: "all",
      meta: {
        description: "Build local Kirie project inputs.",
        name: "build",
      },
      subCommands: {
        all: defineCommand({
          meta: {
            hidden: true,
            name: "all",
          },
          run: () => runBuild(),
        }),
        dotnet: defineCommand({
          meta: {
            description: "Build the Godot C#/.NET project.",
            name: "dotnet",
          },
          run: () => runBuildDotnet(),
        }),
        web: defineCommand({
          meta: {
            description: "Build the Vite web output.",
            name: "web",
          },
          run: () => runBuildWeb(),
        }),
      },
    }),
    dev: defineCommand({
      meta: {
        description: "Start Vite and launch Godot for desktop development.",
        name: "dev",
      },
      run: () => runDev(),
    }),
  },
});
