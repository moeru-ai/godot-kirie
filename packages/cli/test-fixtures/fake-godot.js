import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FAKE_GODOT_INVOCATIONS_FILE = "godot-invocations.json";
const invocations = existsSync(FAKE_GODOT_INVOCATIONS_FILE)
  ? JSON.parse(readFileSync(FAKE_GODOT_INVOCATIONS_FILE, "utf8"))
  : [];

invocations.push({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: {
    KIRIE_DEV: process.env.KIRIE_DEV,
    KIRIE_WEB_URL: process.env.KIRIE_WEB_URL,
  },
});

writeFileSync(FAKE_GODOT_INVOCATIONS_FILE, JSON.stringify(invocations));
