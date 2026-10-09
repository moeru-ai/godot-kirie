---
status: "accepted"
date: 2026-10-08
decision-makers: "LemonNeko"
consulted: "Codex"
informed: "Kirie contributors"
---

# Introduce Kirie plugins and the core plugin

## Context

Kirie currently treats its WebView prerequisites as CLI special cases. The
`kirie-addon` and `godot-cef` doctor targets are implemented directly in the
CLI, and project templates rely on those fixed checks to install the Kirie
addon and the desktop Godot CEF backend.

Further Kirie capabilities need the same three-sided integration shape:

- a browser package that uses Kirie IPC;
- one or more Godot addons that provide engine or native functionality; and
- optionally, a .NET package that attaches host behavior to the application's
  existing Eventa context.

Adding every capability to the fixed Platform API or teaching the CLI about
every addon and .NET package would make the core packages and doctor command a
catalog of unrelated integrations. Ordinary Godot addons also remain useful
without Kirie and should not need npm metadata merely to work in a Godot
project.

Kirie configuration is explicit. Installing an npm package makes its code
available, while adding its descriptor to `kirie.config.ts` enables the plugin
for that project. Automatic discovery from direct or transitive npm
dependencies would make the active capability set harder to inspect.

## Decision

Add a declarative Kirie plugin API and represent Kirie's WebView and IPC stack
as the `core` plugin.

The `kirie/core` entry point exports the built-in plugin descriptor as its
default export. Official project templates import it and include it in the
explicit `plugins` array:

```ts
import core from "kirie/core";
import { defineKirieConfig } from "kirie";

export default defineKirieConfig({
  plugins: [
    core,
  ],
});
```

The descriptor ships in the existing `kirie` package because it coordinates
that package's own addon and desktop backend. Importing it does not enable it;
the project must still include it in the `plugins` array.

The `kirie` package provides `defineKiriePlugin` and its public descriptor
types from a small, side-effect-free plugin API entry point. A plugin package
defines its descriptor in its `index.ts` and exports it by default:

```ts
import { defineKiriePlugin } from "kirie/plugin";

export default defineKiriePlugin({
  id: "example",
  godotAddons: [],
  dotnetPackages: [],
});
```

`defineKiriePlugin` is a typed identity function over declarative data. The
initial API does not provide arbitrary doctor callbacks, shell commands,
runtime hooks, or a second IPC owner. Browser and .NET packages continue to
borrow the application's existing Kirie and Eventa contexts.

Plugin IDs must be unique within one resolved Kirie configuration. The CLI
rejects duplicate IDs before running checks or fixes. The initial descriptor
does not carry an API or manifest version. Compatibility with the plugin API
is expressed through the plugin package's npm dependency or peer-dependency on
`kirie`; a schema version will be added only if multiple manifest formats must
actually coexist.

### Core plugin dependencies

The `core` plugin declares two Godot addon dependencies:

- `addons/kirie`, required for the low-level WebView and IPC surface on every
  supported target;
- `addons/godot_cef`, required by desktop WebView workflows and not by the
  Android or iOS native WebView backends.

The core plugin coordinates installation only. It does not move the public
addon out of `addons/kirie`, merge `@gd-kirie/ipc` into the CLI, or change the
existing low-level transport boundary.

Official templates configure `core` by default. A project may remove it
explicitly, but commands that require the WebView stack must then report that
the core plugin is not configured. Low-level users may continue installing and
using ordinary Godot addons without adopting the Kirie plugin API.

### Godot addon dependencies

A Godot addon dependency declares a stable dependency ID, its destination
under the Godot project, the files needed to recognize a complete
installation, any relevant version constraint, and one of two sources:

- `package`: the addon is bundled in the plugin's npm package. Its source is a
  package-local file URL, and `doctor --fix` copies it into the Godot project.
- `archive`: the descriptor supplies a download URL, SHA-256 digest, and the
  path to the addon within the archive. `doctor --fix` downloads to a temporary
  directory, verifies the digest, extracts and validates the addon, then
  atomically replaces the destination.

Bundling is suitable for small redistributable addons. Archives keep large
native artifacts out of npm package downloads and caches. Both forms are
automatic doctor fixers; neither requires a package lifecycle script.

Addon paths must stay under the configured Godot project. Plugin authors remain
responsible for having permission to redistribute files included in npm
packages or referenced archives.

### .NET package dependencies

A .NET dependency declares a NuGet package ID and required version. Doctor
uses the selected Godot `.csproj` and asks MSBuild for its evaluated
`PackageReference` and `PackageVersion` items:

```sh
dotnet msbuild <project.csproj> -getItem:PackageReference,PackageVersion
```

The command returns structured JSON and evaluates imported MSBuild files, so
Kirie does not parse or serialize project XML. A read-only doctor invocation
does not restore packages or edit project files.

When a reference is missing or incompatible, `doctor --fix` delegates the
change and NuGet compatibility checks to the .NET 10 CLI:

```sh
dotnet package add <package-id> --version <version> --project <project.csproj>
```

Kirie passes validated arguments directly without invoking a shell and runs
the MSBuild item query again to verify the result. Plugin descriptors cannot
provide extra command-line arguments.

### Doctor behavior

`kirie doctor` loads the resolved `plugins` array and appends dependency checks
for every configured plugin to its existing environment and toolchain checks.
It remains read-only. `kirie doctor --fix` applies every available fixer and
then reports the resulting state.

The scoped target syntax is:

```sh
kirie doctor plugin:core
kirie doctor --fix plugin:core
```

A scoped plugin target must refer to a plugin in the resolved configuration.
An installed but unconfigured npm package is ignored. A configured descriptor
whose npm module cannot be loaded is a configuration error.

The fixed `kirie-addon` and `godot-cef` doctor targets are replaced by the
dependencies declared by `core`. Generic addon download, digest verification,
archive extraction, validation, and atomic replacement remain CLI
implementation facilities shared by every plugin.

Kirie does not add a `kirie add` command. Installing a plugin follows the same
explicit shape as installing a Vite plugin:

1. install the npm package with the project's package manager;
2. import its default descriptor in `kirie.config.ts`;
3. add the descriptor to `plugins`;
4. run `kirie doctor --fix`, optionally scoped to the plugin ID.

The CLI may later use TypeScript APIs to automate imports and configuration if
real usage justifies it. That editing workflow is outside this decision.

### Kirie plugins and ordinary Godot addons

A Kirie plugin is an npm integration package that participates in Kirie's IPC
architecture and publishes a Kirie plugin descriptor. A Godot addon remains an
engine-side package and does not need a Kirie descriptor, npm package, or
doctor integration.

An author may publish a Kirie companion package to manage an existing Godot
addon or connect it to Kirie IPC. That companion is optional; Kirie does not
scan or take ownership of ordinary addons installed by the application.

## Consequences

- The default WebView stack exercises the same public plugin and doctor paths
  offered to third-party integrations.
- Project configuration shows every enabled Kirie plugin explicitly.
- The CLI loses hard-coded ownership of Kirie addon and Godot CEF versions;
  those requirements move to the core plugin descriptor.
- Plugin npm packages can remain small while doctor manages large,
  integrity-checked native archives.
- .NET project changes follow supported MSBuild and NuGet tooling instead of a
  Kirie XML writer.
- Templates and examples must add the core package and explicit plugin
  configuration before the fixed doctor targets can be removed.
- Plugin descriptors are executable JavaScript modules loaded through the
  existing TypeScript configuration path, so projects retain the same trust
  boundary as other installed build tooling.

## Rejected Alternatives

### Keep WebView dependencies as doctor special cases

This gives the default integration a privileged path that other Kirie plugins
cannot use and requires new CLI code for each future capability.

### Discover plugins from npm dependencies

Package installation does not necessarily mean that an application enabled a
capability. Transitive discovery can also activate plugins that the
application never selected.

### Install addons from dependency postinstall scripts

Dependency lifecycle scripts may run from a package directory, may be disabled
by the package manager, and would mutate the Godot project during an ordinary
npm install. Doctor already provides an explicit, repeatable repair phase.

### Add a Kirie-specific package installation command

Installing one npm package, adding one import and configuration entry, and
running doctor is already a short and familiar workflow. Editing arbitrary
TypeScript configuration safely would add more machinery than the initial
plugin system needs.

### Parse and rewrite project XML

MSBuild can report evaluated package items as JSON, and the .NET CLI already
adds or updates package references while handling NuGet and central package
management semantics.

## References

- [Current Kirie architecture](../architecture.md)
- [Godot plugin installation](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/installing_plugins.html)
- [Evaluate MSBuild items and properties](https://learn.microsoft.com/en-us/visualstudio/msbuild/evaluate-items-and-properties)
- [.NET `dotnet package add`](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-add)
