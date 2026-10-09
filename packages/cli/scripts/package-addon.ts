import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../kirie/addon/addons/kirie", import.meta.url));
const destination = fileURLToPath(new URL("../addon/kirie", import.meta.url));

await Promise.all(
  ["plugin.cfg", "plugin.gd", "kirie_node.gd", "gd_kirie.gd"].map((file) =>
    fs.access(path.join(source, file)),
  ),
);
await fs.rm(destination, { force: true, recursive: true });
await fs.mkdir(fileURLToPath(new URL("../addon", import.meta.url)), { recursive: true });
await fs.cp(source, destination, { recursive: true });
