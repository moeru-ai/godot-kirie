export interface PackageGodotAddonSource {
  type: "package";
  url: string;
}

export interface ArchiveGodotAddonSource {
  archivePath: string;
  sha256: string;
  type: "archive";
  url: string;
}

export type GodotAddonSource = ArchiveGodotAddonSource | PackageGodotAddonSource;

export interface KirieGodotAddonDependency {
  id: string;
  optional?: boolean;
  path: string;
  source: GodotAddonSource;
  version?: string;
}

export interface KirieDotnetPackageDependency {
  id: string;
  version: string;
}

export interface KiriePlugin {
  id: string;
  dotnetPackages?: KirieDotnetPackageDependency[];
  godotAddons?: KirieGodotAddonDependency[];
}

export function defineKiriePlugin(plugin: KiriePlugin): KiriePlugin {
  return plugin;
}
