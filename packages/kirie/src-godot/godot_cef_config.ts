export interface GodotCefConfig {
  class_name: string;
  addon_path: string;
  version: string;
  setup_command: string;
}

export class KirieGodotCefConfig extends RefCounted {
  static load(): GodotCefConfig | null {
    const file = FileAccess.open(KirieGodotCefConfig.PATH, FileAccess.READ);
    if (file === null) {
      push_error(`Kirie Godot CEF config not readable: ${KirieGodotCefConfig.PATH}`);
      return null;
    }

    const parsed = JSON.parse_string(file.get_as_text());
    if (!(parsed instanceof Dictionary)) {
      push_error("Kirie Godot CEF config must be a JSON object");
      return null;
    }

    const cef_class_name = parsed.get("class_name");
    const addon_path = parsed.get("addon_path");
    const version = parsed.get("version");
    const setup_command = parsed.get("setup_command");
    if (
      !gd.is(cef_class_name, String) ||
      !gd.is(addon_path, String) ||
      !gd.is(version, String) ||
      !gd.is(setup_command, String)
    ) {
      push_error("Kirie Godot CEF config has invalid fields");
      return null;
    }

    return {
      class_name: cef_class_name,
      addon_path: addon_path,
      version: version,
      setup_command: setup_command,
    };
  }
}

export namespace KirieGodotCefConfig {
  export const PATH = "res://addons/kirie/godot_cef.json";
}
