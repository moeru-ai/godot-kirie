export type KiriePluginPlatform = "android" | "desktop" | "ios";

export interface PackageGodotAddonSource {
  type: "package";
  url: string;
}

export interface ArchiveGodotAddonSource {
  archivePath: string;
  checksumPath?: string;
  sha256: string;
  type: "archive";
  url: string;
}

export type GodotAddonSource = ArchiveGodotAddonSource | PackageGodotAddonSource;

export interface KirieGodotAddonDependency {
  id: string;
  name: string;
  optional?: boolean;
  path: string;
  platforms?: KiriePluginPlatform[];
  requiredFiles: string[];
  source: GodotAddonSource;
  version?: string;
}

export interface KirieDotnetPackageDependency {
  id: string;
  version: string;
}

export interface KiriePluginDependencies {
  dotnetPackages?: KirieDotnetPackageDependency[];
  godotAddons?: KirieGodotAddonDependency[];
}

export interface KiriePlugin {
  dependencies?: KiriePluginDependencies;
  id: string;
}

export function defineKiriePlugin(plugin: KiriePlugin): KiriePlugin {
  return plugin;
}
