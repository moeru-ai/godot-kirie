import { loadKirieConfig } from "./config.ts";
import { launchGodot, prepareGodotProject } from "./godot.ts";
import { startViteDevServer } from "./vite.ts";

export interface DevOptions {
  cwd?: string;
}

export async function runDev(options: DevOptions = {}): Promise<void> {
  const config = await loadKirieConfig(options.cwd);
  const vite = await startViteDevServer(config);
  let godot: ReturnType<typeof launchGodot> | undefined;

  try {
    console.log(`Kirie dev server: ${vite.url}`);
    await prepareGodotProject(config);
    godot = launchGodot(config, vite.url);
    await godot;
  } finally {
    godot?.kill("SIGTERM");
    await vite.server.close();
  }
}
