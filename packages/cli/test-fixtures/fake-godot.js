import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = "godot-invocations.json";
const invocations = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];

invocations.push({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: {
    KIRIE_DEV: process.env.KIRIE_DEV,
    KIRIE_WEB_URL: process.env.KIRIE_WEB_URL,
  },
});

writeFileSync(file, JSON.stringify(invocations));
