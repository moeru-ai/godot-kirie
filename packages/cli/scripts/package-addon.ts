import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../kirie/addon/addons/kirie", import.meta.url));
const addonRoot = fileURLToPath(new URL("../addon", import.meta.url));
const destination = fileURLToPath(new URL("../addon/kirie", import.meta.url));

await fs.rm(destination, { force: true, recursive: true });
await fs.mkdir(addonRoot, { recursive: true });
await fs.writeFile(fileURLToPath(new URL("../addon/.gdignore", import.meta.url)), "");
await fs.cp(source, destination, { recursive: true });
