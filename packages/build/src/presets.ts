import fs from "node:fs";
import path from "node:path";
import { parse as parseIni } from "ini";

interface ParsedExportPresets {
  preset?: Record<string, { name?: string; options?: Record<string, string> }>;
}

export interface ReadExportPresetOptionOptions {
  optionName: string;
  presetName: string;
  projectDir: string;
}

export function readExportPresetOption(options: ReadExportPresetOptionOptions): string {
  const exportPresetsPath = path.join(options.projectDir, "export_presets.cfg");
  const config = parseIni(fs.readFileSync(exportPresetsPath, "utf8")) as ParsedExportPresets;

  for (const preset of Object.values(config.preset ?? {})) {
    if (preset.name !== options.presetName) {
      continue;
    }

    const value = preset.options?.[options.optionName];
    if (value === undefined) {
      throw new Error(
        `Export preset option not found: ${options.optionName} in ${exportPresetsPath}`,
      );
    }

    return value;
  }

  throw new Error(`Export preset not found: ${options.presetName} in ${exportPresetsPath}`);
}
