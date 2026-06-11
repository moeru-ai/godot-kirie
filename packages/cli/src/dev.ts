import { loadKirieConfig } from "./config";
import { launchGodot } from "./godot";
import { startViteDevServer } from "./vite";

export interface DevOptions {
  cwd?: string;
}

export async function runDev(options: DevOptions = {}): Promise<void> {
  const config = await loadKirieConfig(options.cwd);
  const vite = await startViteDevServer(config);
  let godot: ReturnType<typeof launchGodot> | undefined;

  try {
    console.log(`Kirie dev server: ${vite.url}`);
    godot = launchGodot(config, vite.url);
    await godot;
  } finally {
    godot?.kill("SIGTERM");
    await vite.server.close();
  }
}
