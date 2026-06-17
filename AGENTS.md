# AGENTS

This repository is an experimental Godot application framework built around an
intentionally reusable low-level WebView plugin and IPC core.

## Current Scope

The low-level plugin and IPC milestone covers:

1. create a platform WebView
2. establish bidirectional IPC between Godot and the WebView
3. support packaged `res://` web content loading enough for bridge tests
4. add desktop Godot CEF compatibility, starting with macOS
5. stabilize the Kirie plugin shape used by higher-level framework tooling

Application-framework behavior belongs above the low-level plugin and IPC core.
The existing `@gd-kirie/ipc` package is a thin browser-side transport wrapper;
do not expand it into an application event or invocation layer unless the user
explicitly asks for that higher-level work. The planned Kirie CLI owns the app
workflow described below: development sessions, local build inputs, export and
run semantics, initialization, and diagnostics.

The mobile IPC v1 experiment keeps Kirie core byte-oriented and CBOR-based with
text, binary, and data lanes. JSON belongs to callers or adapters, not to Kirie
core. Keep Eventa adapters above Kirie and out of `addons/kirie`. Android uses
AndroidX WebKit ArrayBuffer channels, while iOS carries CBOR packets as base64
strings through WKWebView script messages. Desktop compatibility starts with
Godot CEF as a backend for Kirie's existing WebView and IPC surface, not as a
reason to expose the full Godot CEF browser API through Kirie.

## Repository Layout

- `packages/kirie/addon/addons/kirie`
  Godot-facing plugin files, including `plugin.gd`, `export_plugin.gd`,
  `gd_kirie.gd`, `kirie_node.gd`, and `csharp/KirieClient.cs`
- `packages/kirie/native/android`
  Kotlin Android implementation
- `packages/kirie/native/ios`
  Swift iOS implementation
- `packages/ipc`
  thin browser-side IPC transport wrapper for WebView pages
- `packages/ipc-eventa`
  browser-side Eventa adapter over Kirie text IPC
- `packages/GdKirie.EventaAdapter`
  .NET 10 Eventa adapter over Kirie text IPC
- `examples/basic-ipc`
  beginner-friendly demo project for the raw IPC flow
- `examples/basic-kirie-cli`
  beginner-friendly demo project for the Kirie CLI workflow
- `examples/eventa-csharp`
  beginner-friendly demo project for Godot C# Eventa adapter usage
- `tests/integration`
  exported-app platform bridge regression target
- `scripts/build.ts`
  mise task entrypoint re-exports
- `scripts/build-kirie.ts`
  Kirie addon artifact and packaging tasks
- `scripts/build-integration.ts`
  platform integration export tasks
- `scripts/build-examples.ts`
  example build, install, and launch tasks
- `scripts/build-shared.ts`
  build primitives shared by multiple task domains
- `scripts/integration-runner.ts`
  platform integration test launchers
- `.codex/skills`
  repo-local Codex skills for project maintenance workflows
- `docs`
  lightweight architecture notes

## References

Prefer the official references collected in `docs/references.md` before relying
on memory for Godot plugin APIs or platform WebView behavior.

When proposing or adopting a technical approach, cite at least one relevant
source: official documentation, the upstream GitHub repository, or a relevant
community discussion. Prefer official documentation or upstream repositories for
API and compatibility decisions. Treat community comments as supplemental and
label them as anecdotal when they influence a decision.

## Design Constraints

- Treat `Kirie` as the service layer API.
- Treat `KirieNode` as a scene-friendly wrapper, not a promise that the native
  WebView behaves like a normal Godot-rendered node.
- Prefer a small public API and simple message flow over a broad protocol.
- Treat `kirie` as a low-level WebView and IPC bridge, not as the final
  application event layer.
- Defer higher-level semantics such as invocation APIs and richer event models
  to layers above `kirie`, such as future adapters.
- Keep `@gd-kirie/ipc` as a thin browser-side transport wrapper around the raw
  native bridge. Defer richer browser SDKs until there is a real app-level use
  case.
- For IPC v1, treat `text`, `binary`, and `data` as Kirie core lanes over a
  CBOR packet format. Do not reintroduce automatic JSON serialization into
  Kirie core; JSON is an application or adapter encoding choice.
- On Android, the browser package uses `cborg`, WebView transport uses AndroidX
  WebKit `WebMessageListener` ArrayBuffer channels, and native encoding or
  decoding uses Jackson CBOR. Keep Godot-side GDScript and C# wrappers thin;
  do not add a GDScript CBOR codec.
- On iOS, Swift uses SwiftCBOR for the same lane payload contract and WKWebView
  script messages carry base64 CBOR packets. Native Godot-facing methods and
  signals should be registered through ClassDB with `ClassDB::bind_method` and
  `ADD_SIGNAL`; do not reintroduce a hand-written `callp` dispatch table or a
  Godot-side callback registry.
- Use Godot CEF as a learning reference and future compatibility target for
  text, binary, and CBOR-backed data IPC lanes.
- Desktop Godot CEF support starts with macOS and should preserve the existing
  Kirie public API. Keep the detailed desktop backend, runtime-injection, and
  artifact rules centralized in `docs/architecture.md`.
- For the current milestone, treat `KirieNode` as the scene-tree ownership unit
  for a platform WebView. Users decide whether a `KirieNode` lives in the main
  scene, under a Godot `Window`, or in another scene structure.
- Keep window organization, named routing, cross-view forwarding, and prefab
  window helpers above Kirie core until the user explicitly asks for that
  higher-level work. BrowserWindow remains a dream-level API and should not be
  implemented in GDScript; future high-level window APIs should target C# and
  TypeScript packages.
- Keep the Godot-facing wrapper thin; prefer forwarding to the platform
  singleton over reimplementing platform lifecycle logic in GDScript.
- Keep `KirieClient` as a thin C# wrapper over the same platform singleton.
  Expose Kirie signals as C# events, and keep internal Godot `Callable` usage as
  bridge plumbing rather than public API.
- Kirie supports packaged web content sourced from project resources. The
  planned Kirie app layout standardizes production web content at
  `res://src-web/dist/index.html`. When that migration is implemented, drop the
  previous `res://web` behavior instead of preserving a compatibility layer.
  Runtime-mounted Godot packs remain out of scope for that loading path.
- If an API is needed by both GDScript and C#, keep the behavior aligned and
  keep C# as a thin wrapper.

## Planned Kirie CLI Direction

The planned Kirie app layout is:

- `kirie.config.ts`
- `package.json`
- `project.godot`
- `src-godot/`
- `src-web/`
- `addons/kirie/`
- optional `addons/godot_cef/`

Kirie CLI should be installed through npm. The current foundation commands are:

- `kirie dev`: start the Vite development server, launch Godot as a child
  process, and inject `KIRIE_DEV=1` and
  `KIRIE_WEB_URL=<resolved Vite URL>`.
- `kirie build`: build every configured local input needed by a runnable or
  exportable Godot project, without exporting platform packages.
- `kirie build web`: build only the Vite web output for Godot resource loading.
- `kirie build dotnet`: build only the Godot C#/.NET project when one is
  configured or discovered.
- `kirie init`: explicitly initialize a Kirie project and write required
  project configuration.
- `kirie doctor`: diagnose project configuration without writing files.
- `kirie doctor --fix`: explicitly repair supported configuration problems.

The broader app workflow should keep these command semantics:

- `kirie build [--mode <mode>]`: prepare local inputs and finish. The default
  mode is `production`; `development` and custom modes are planned but not
  implemented yet.
- `kirie export [--mode <mode>]`: build first, then produce a platform package.
- `kirie run [--mode <mode>]`: build first, then directly run the scene or
  deploy built outputs by default.
- `kirie run --export`: explicitly export before running the exported package.
- `kirie dev`: start the Vite hot-reload server and run a development session;
  do not run the production web build. Desktop development can run without
  exporting, while mobile or deploy-style development may use a development
  export path. C#/.NET may be built when configured.

Keep `kirie create` outside the current CLI scope. Future mobile dev targets
should use a unified platform and device selector such as
`kirie dev ios --device <selector>` or
`kirie dev android --device <selector>`; do not expose simulator and real device
as separate user-facing target names.

Kirie enforces Vite for user web source. Advanced Vite options belong in
`kirie.config.ts` under `web.vite`, but Kirie owns `root`, `base`,
`server.host`, `server.port`, `server.open`, and `build.outDir`. Explicit CLI
flags may override runtime server values for a single command invocation.
Planned `kirie dev` flags include `--config <path>` for the Kirie config,
`--project <dir>` for the Godot project, `--godot <path>` for a Godot executable
override, and Vite-shaped flags such as `--host <host>`, `--port <number>`,
`--strict-port`, `--mode <mode>`, `--force`, `--log-level <level>`,
`--clear-screen`, and `--no-clear-screen`. Kirie must either parse and map
Vite-shaped flags explicitly to Vite's public JavaScript API or proxy them to
the real Vite CLI; unknown flags must not be silently ignored. Arguments after
`--` on `kirie dev` belong to Godot.

Only explicit setup and repair commands may write Godot configuration.
`kirie init` and `kirie doctor --fix` may modify `project.godot` or
`export_presets.cfg`, but those writes must go through Godot itself, for
example a headless Godot helper using `ProjectSettings` or `ConfigFile`. Runtime
commands such as `kirie dev`, `kirie build`, and future `kirie export` should
fail on wrong configuration and point users to `kirie doctor`.

Kirie user projects should not contain Capacitor-style `ios/` or `android/`
native project directories. Native features belong in Godot plugins.

## Android Packaging Direction

The repository is allowed to evolve internally, but the intended external shape
is a standard Godot plugin:

- users consume `addons/kirie`
- Android binaries are exported through `EditorExportPlugin`
- Maven-based Android delivery can be revisited if Kirie gains Android
  dependencies that need Gradle metadata or transitive resolution

When producing a downloadable addon tree, ensure Android `.aar` files are real
files in the staged output, not repository-local symlinks into Gradle build
directories.

## iOS Packaging Direction

For the current milestone, iOS should be owned by the standard addon tree:

- users consume `addons/kirie`
- `Kirie.debug.xcframework` and `Kirie.release.xcframework` belong under
  `addons/kirie/ios` in staged addon trees
- iOS native pieces are injected through `EditorExportPlugin` Apple export hooks
- do not reintroduce `res://ios/plugins` or `.gdip` shims unless the export hook
  approach fails and the user explicitly chooses that fallback

## Working Style

- Keep changes aligned with the current milestone.
- When a same-session temporary decision is replaced, converge on the latest decision directly; do not add compatibility unless explicitly requested.
- Do not add regression tests solely to prevent an implementation pattern that
  is already known to be invalid or contrary to the chosen API. Remove or
  correct the invalid usage instead; keep tests focused on supported behavior
  and realistic regressions.
- Use English only for agent-facing communication, project-maintenance notes,
  AGENTS updates, and project documentation unless the user explicitly requests
  a non-English artifact.
- Avoid the bridge metaphor `envelope`/`envelop` in comments, docs, task names,
  and new APIs unless referring to an upstream domain type such as Eventa's
  `EventEnvelope`.
- Favor small, testable steps that can be exercised through
  `examples/basic-ipc` or `tests/integration`.
- Default to a standard multi-agent workflow for non-trivial tasks whenever the
  agent runtime supports delegation. Use independent sidecar agents for fact
  finding or context description, deletion/prosecutor review, and build or
  validation scope before finalizing work; for implementation work, keep each
  agent's ownership and write scope explicit.
- If delegation is unavailable or a task is too small to benefit from
  independent agents, state that exception briefly and continue with the
  smallest useful single-agent workflow.
- When touching native code, keep the Godot-facing API stable unless there is a
  strong reason to change it.
- When adding agent-facing guidance, prefer `AGENTS.md` and repo-local skills
  over ad hoc note files.
- Pull request titles must follow the same Conventional Commits-style
  subject format as commit titles, for example `ci: cache iOS build inputs`
  or `refactor(build): migrate task orchestration`.

## Tooling

- Project development tools are managed by mise. Run repository commands
  through `mise x -- <command>` unless the shell has already activated mise.
- Install or refresh tools with `mise install`.
- pnpm is managed by Node Corepack and the root `packageManager` field, not by
  mise. Prefer `mise x -- corepack pnpm ...` for package scripts.
- Godot editor is managed by mise through the project `godot` tool. Use
  `mise x -- godot ...`; use `mise which godot` when a direct executable path is
  needed.
- The Godot mise alias may temporarily point at a forked `asdf-godot` ref until
  upstream supports macOS mono installs. Do not replace this with an `http`
  tool workaround.
- Keep Gradle wrapper and Xcode usage as-is; mise only provides the Java runtime
  and command-line tools around them.
- Start command invocations with the fewest necessary flags and options. Add
  extra flags only after the project or user has a concrete need for them.
- Native artifact orchestration lives in mise tasks, with entrypoints
  re-exported from `scripts/build.ts` and Kirie implementation in
  `scripts/build-kirie.ts`. Use `mise run build:android-aar`,
  `mise run build:ios-xcframework`, or `mise run build:native-artifacts`
  instead of adding new shell-only orchestration for the same artifact path.
- Addon release packaging also lives in mise tasks, with Kirie implementation
  in `scripts/build-kirie.ts`. Use `mise run build:addon-pack` to build native
  artifacts and produce `dist/kirie-addon.zip`; use
  `mise run check:addon-pack` to verify an already staged addon tree.
- Integration export orchestration also lives in mise tasks, with implementation
  in `scripts/build-integration.ts` and shared export primitives in
  `scripts/build-shared.ts`. Use
  `mise run build:integration-android` or `mise run build:integration-ios`
  instead of adding new integration build shell scripts.
- Keep repository task TypeScript executable by Node's built-in TypeScript type
  stripping: use erasable TypeScript syntax only in `scripts/build*.ts`,
  `scripts/integration-runner.ts`, and `scripts/run-build-task.js`, and do not
  add `ts-node`, `tsx`, or other TypeScript runtime loaders unless a real
  non-erasable TypeScript need appears.

## Engineering Rules

These rules are intended to guide future work even when the full tooling is not
configured yet.

### Type and style

- Prefer type inference in GDScript, TypeScript, Kotlin, and Swift when the
  inferred type is stable and obvious.
- Prefer current stable language syntax supported by the repository toolchain
  when it improves type clarity or reduces boilerplate without hurting
  readability.
- Do not add redundant explicit types to short local variables just to satisfy a
  style preference.
- Keep public APIs, cross-language boundaries, exported properties, signal
  payloads, and bridge-facing types explicit when that improves readability.
- For TypeScript object shapes, prefer `interface` over `type`. Keep `type` for
  unions, intersections, mapped types, conditional types, and other aliases that
  are not simple object shapes. This is enforced by Biome's
  `lint/nursery/useConsistentTypeDefinitions` rule; do not add custom checks for
  this preference.
- Prefer idiomatic C# events on public C# wrappers instead of exposing raw Godot
  signal connection details to C# users.
- Prefer `val` over `var` in Kotlin unless mutation is required.
- Prefer `let` over `var` in Swift unless mutation is required.
- Prefer early returns and early continues to keep control flow flat. Avoid
  nesting conditionals when a guard clause or loop `continue` can handle the
  exceptional or irrelevant case clearly.
- Avoid suppressing compiler, linter, or deprecation warnings. Use suppression
  only when the current platform or compatibility target temporarily requires an
  older API and the modern API is already used where available.
- For JavaScript and TypeScript in this repo, avoid unnecessary `void` usage to
  swallow async promises and avoid unnecessary dynamic imports.
- For JavaScript and TypeScript callbacks, prefer eta reduction when the wrapper
  does not adapt arguments, bind context, add control flow, or improve
  readability.

### Simplicity and abstraction

- Do not introduce abstractions for hypothetical future needs.
- Let real repetition and real pressure from the current milestone justify new
  shared layers.
- Prefer small, local duplication over premature shared abstractions.
- Do not create vague `utils`, `helpers`, `common`, or `shared` modules without
  a clear domain-specific reason.
- Do not wrap platform APIs with thin pass-through helpers unless the wrapper
  actually stabilizes the Godot-facing API, hides a platform difference, or
  creates a meaningful test seam.
- Do not add extra guard code only to beautify errors. Prefer the underlying
  tool, runtime, or filesystem error unless the guard changes behavior or makes
  a likely failure materially easier to debug.
- Do not add helper functions, quoting layers, duplicate logs, or wrapper
  messages only to make errors look nicer. When a custom error is required, keep
  it directly tied to required behavior such as failing invalid configuration,
  naming the missing input, or printing an exact setup command.
- Prefer keeping logic close to the module that owns it instead of extracting it
  into cross-cutting helpers too early.
- Add configuration, extension points, and generic options only when they are
  required by a real use case.
- Remove speculative or unused structure instead of keeping it around "for
  later".

### Public API stability

- Treat `Kirie` and `KirieNode` as the primary public API surfaces.
- Prefer low-level public names such as `load_url`, `send_text`, `send_binary`,
  and `send_data` while the bridge remains transport-oriented.
- When extending IPC v1, keep the explicit text, binary, and data lane APIs
  aligned across GDScript, C#, the browser package, and native platforms. Do not
  revive the JSON-shaped `send_ipc_message` path except as a temporary
  compatibility fallback for an unmigrated platform.
- Do not rename public methods, signal names, or exported properties without a
  clear reason.
- If a public API change is necessary, update the example project and
  documentation in the same change.

### Validation

- Use `examples/basic-ipc` for manual demo validation and `tests/integration`
  for exported-app platform bridge regressions.
- Run the relevant lint target through mise after changing a covered language:
  - GDScript: `mise run lint:gdscript`
  - TypeScript, JSON, CSS, and HTML: `mise run lint:biome`
  - Kotlin and Gradle Kotlin DSL: `mise run lint:kotlin`
  - Swift: `mise run lint:swift`
- Run `mise run lint` when changes span multiple covered
  languages or before finalizing broad changes.
- Use the matching format target when making style-only fixes:
  `mise run format:gdscript`,
  `mise run format:biome`,
  `mise run format:kotlin`, or
  `mise run format:swift`.
- When changing Android bridge code, validate the Godot-to-native-to-web path as
  soon as practical.
- After changing Android native code under `packages/kirie/native/android`,
  run `mise run build:android-aar` before exported-app tests.
- When changing iOS bridge code, validate the Godot-to-native-to-web path as
  soon as practical.
- After changing iOS native code under `packages/kirie/native/ios`, always run
  `mise run build:ios-xcframework` before device testing.
- When changing the IPC shape, make sure at least one real request/response
  exchange remains manually exercised through `examples/basic-ipc` or covered
  by integration tests once those tests are migrated to the lane API.
- When changing `KirieClient`, compile it against the Godot .NET SDK. A platform
  integration smoke test for its C# event API is still pending.

### Dependencies

- Prefer platform APIs and small foundational libraries over large framework
  additions.
- Do not add a new dependency unless it materially reduces risk or complexity
  for the current milestone.
- When adding or upgrading dependencies, prefer the latest stable/current
  versions unless the repository, platform, or compatibility target requires an
  older version.
- Keep JavaScript-side dependencies light until the IPC model and plugin shape
  are stable.

### Generated files

- Generated code must be clearly marked, ideally with a `.generated.` segment in
  the filename.
- Do not hand-edit generated files unless the user explicitly asks for it or the
  generation pipeline does not exist yet and the file is being used as a
  temporary placeholder.
- If generated output is changed manually as a temporary measure, leave a clear
  note explaining that the generation source still needs to be introduced.

### Binary artifacts

- Avoid committing build outputs by default.
- `.aar`, `.xcframework`, exported app bundles, and similar binaries are release
  staging artifacts in this repository. Generate them into the addon tree or
  release staging tree when needed, but do not commit them.
- If the repository intentionally adopts a binary artifact class as
  source-distributed plugin assets later, add the exception explicitly here and
  update `.gitignore` in the same change.

### Logging and lifecycle

- IPC logs should make message direction clear whenever logging is introduced.
- Request/response flows should carry explicit correlation IDs.
- UI-bound WebView operations should remain on the platform UI thread or main
  actor.
- Be explicit about readiness and lifecycle transitions before sending bridge
  messages.

## Configured And Pending Coverage

The following directions are intentional, but some are only partially covered.
Agents should distinguish already-enforced infrastructure from remaining
coverage gaps.

- GitHub Actions are configured for lint, Android platform integration, iOS
  platform integration, npm package publishing, and addon release packaging.
  Broader release matrix coverage beyond the current addon zip is still not
  configured.
- Automated platform integration coverage for the C# `KirieClient` wrapper does
  not exist yet.
- Desktop Godot CEF integration coverage runs through `tests/integration`, with
  desktop CI configured for macOS, Windows, and Linux. macOS export coverage is
  still not configured yet.
- Browser-side Eventa adapter support exists in `@gd-kirie/ipc-eventa`.
- `GdKirie.EventaAdapter` is a .NET 10-only package. It supports Eventa events
  and unary RPC over Kirie text IPC, keeps Eventa source out of `addons/kirie`,
  and uses a NuGet source bridge when it needs to connect to addon-shipped
  `KirieClient.cs`. `net8.0` and `net9.0` consumers are expected to fail
  restore or build when they reference the adapter.
