import type { KiriePlugin } from "./plugin.ts";

import { describe, expect, it } from "vitest";
import { resolveKirieConfig } from "./config.ts";

describe("kirie plugin configuration", () => {
  it("rejects incompatible addons at the same destination", () => {
    const plugin = (id: string, version: string): KiriePlugin => ({
      id,
      dependencies: {
        godotAddons: [{
          id: "example",
          name: "Example",
          path: "addons/example",
          requiredFiles: ["plugin.cfg"],
          source: { type: "package", url: `file:///${id}` },
          version,
        }],
      },
    });

    expect(() => resolveKirieConfig(
      { plugins: [plugin("one", "1.0.0"), plugin("two", "2.0.0")] },
      { cwd: "/project" },
    )).toThrow("Kirie plugins one and two declare incompatible addons at addons/example");
  });
});
