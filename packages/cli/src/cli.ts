#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

import packageJson from "../package.json" with { type: "json" };
import { runDev } from "./dev.ts";

const main = defineCommand({
  meta: {
    description: "Kirie development tools.",
    name: "kirie",
    version: packageJson.version,
  },
  subCommands: {
    dev: defineCommand({
      meta: {
        description: "Start Vite and launch Godot for desktop development.",
        name: "dev",
      },
      run: () => runDev(),
    }),
  },
});

await runMain(main);
