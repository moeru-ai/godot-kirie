import { afterEach, describe, expect, it } from "vitest";

import { exportIosSimulatorApp } from "./ios.ts";
import { createBasicKirieCliProjectTracker } from "./test-project.ts";

const projects = createBasicKirieCliProjectTracker("kirie-cli-ios-");

afterEach(async () => {
  await projects.cleanup();
});

describe("exportIosSimulatorApp", () => {
  it("rejects project root app output paths before exporting", async () => {
    const project = await projects.copy();

    await expect(
      exportIosSimulatorApp({
        appPath: ".",
        build: false,
        cwd: project,
      }),
    ).rejects.toThrow("iOS simulator app output path must end with .app");
  });
});
