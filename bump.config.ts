import { execFileSync } from "node:child_process";

import { defineConfig } from "bumpp";

export default defineConfig({
  all: true,
  commit: "release: v%s",
  execute: () => {
    execFileSync("pnpm", ["run", "build:packages"], { stdio: "inherit" });
    execFileSync("pnpm", ["publish", "-r", "--access", "public", "--no-git-checks", "--dry-run"], {
      stdio: "inherit",
    });
  },
  push: false,
  recursive: true,
  sign: false,
  tag: "v",
});
