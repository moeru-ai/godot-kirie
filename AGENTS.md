# AGENTS

This repository is an experimental but intentionally reusable Godot plugin
project.

## Current Scope

The current milestone is limited to:

1. create a platform WebView
2. establish bidirectional IPC between Godot and the WebView
3. stabilize the Kirie plugin shape before adding larger tooling layers

Do not introduce extra packages, adapters, or CLI workflows unless they are
required to make the current IPC milestone work.

## Repository Layout

- `packages/kirie/addon/addons/kirie`
  Godot-facing plugin files, including `plugin.gd`, `export_plugin.gd`,
  `gd_kirie.gd`, and `kirie_view.gd`
- `packages/kirie/native/android`
  Kotlin Android implementation
- `packages/kirie/native/ios`
  Swift iOS implementation
- `examples/basic-ipc`
  the first integration and regression target
- `docs`
  lightweight architecture notes

## References

Prefer the official references collected in `docs/references.md` before relying
on memory for Godot plugin APIs or platform WebView behavior.

## Design Constraints

- Treat `Kirie` as the service layer API.
- Treat `KirieView` as a scene-friendly wrapper, not a promise that the native
  WebView behaves like a normal Godot-rendered node.
- Prefer a small public API and simple message flow over a broad protocol.
- Treat `kirie` as a low-level WebView and IPC bridge, not as the final
  application event layer.
- Defer higher-level semantics such as invocation APIs and richer event models
  to layers above `kirie`, such as future adapters.
- For the current milestone, assume a single active WebView unless the user
  explicitly asks to reintroduce multi-WebView behavior.
- Keep the Godot-facing wrapper thin; prefer forwarding to the platform
  singleton over reimplementing platform lifecycle logic in GDScript.
- Keep in mind that Kirie is expected to support offline web content sourced
  from project resources, including future `res://`-based loading flows.
- If an API is needed by both GDScript and C#, define the shape once and keep
  C# as a thin wrapper.

## Android Packaging Direction

The repository is allowed to evolve internally, but the intended external shape
is a standard Godot plugin:

- users consume `addons/kirie`
- Android dependencies should eventually be injected through
  `EditorExportPlugin`
- Maven-based Android delivery is preferred over committing local `.aar` files
  when it becomes practical

During bring-up, avoid locking the repo into a distribution model that makes the
example project harder to run.

## iOS Packaging Direction

For the current milestone, prefer the standard Godot iOS plugin layout and do
not block iOS bridge work on installer ergonomics:

- keep the real iOS plugin description in `.gdip`
- assume Godot discovers iOS plugins through `res://ios/plugins`
- do not introduce a custom editor-time sync layer unless it is explicitly part
  of the task at hand

A future editor plugin may generate a thin `ios/plugins/kirie/Kirie.gdip` shim
from addon-owned data so users can update mostly through `addons/kirie`, but
that is deferred work and should not complicate the current IPC milestone.

## Working Style

- Keep changes aligned with the current milestone.
- Favor small, testable steps that can be exercised through
  `examples/basic-ipc`.
- When touching native code, keep the Godot-facing API stable unless there is a
  strong reason to change it.
- When adding agent-facing guidance, prefer `AGENTS.md` and repo-local skills
  over ad hoc note files.

## Engineering Rules

These rules are intended to guide future work even when the full tooling is not
configured yet.

### Type and style

- Prefer type inference in GDScript, TypeScript, Kotlin, and Swift when the
  inferred type is stable and obvious.
- Do not add redundant explicit types to short local variables just to satisfy a
  style preference.
- Keep public APIs, cross-language boundaries, exported properties, signal
  payloads, and bridge-facing types explicit when that improves readability.
- Prefer `val` over `var` in Kotlin unless mutation is required.
- Prefer `let` over `var` in Swift unless mutation is required.
- For JavaScript and TypeScript in this repo, avoid unnecessary `void` usage to
  swallow async promises and avoid unnecessary dynamic imports.

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
- Prefer keeping logic close to the module that owns it instead of extracting it
  into cross-cutting helpers too early.
- Add configuration, extension points, and generic options only when they are
  required by a real use case.
- Remove speculative or unused structure instead of keeping it around "for
  later".

### Public API stability

- Treat `Kirie` and `KirieView` as the primary public API surfaces.
- Prefer low-level public names such as `load_url` and `send_ipc_message` while
  the bridge remains transport-oriented.
- Do not rename public methods, signal names, or exported properties without a
  clear reason.
- If a public API change is necessary, update the example project and
  documentation in the same change.

### Validation

- Prefer validating through `examples/basic-ipc`.
- When changing Android bridge code, validate the Godot-to-native-to-web path as
  soon as practical.
- When changing iOS bridge code, validate the Godot-to-native-to-web path as
  soon as practical.
- When changing the IPC shape, make sure at least one real request/response
  round-trip remains covered by the example.

### Dependencies

- Prefer platform APIs and small foundational libraries over large framework
  additions.
- Do not add a new dependency unless it materially reduces risk or complexity
  for the current milestone.
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
- Do not commit `.aar`, `.xcframework`, exported app bundles, or similar binary
  artifacts unless the repository intentionally adopts them as source-distributed
  plugin assets.
- If the repository starts tracking a binary artifact class intentionally, add
  the rule explicitly here.

### Logging and lifecycle

- IPC logs should make message direction clear whenever logging is introduced.
- Request/response flows should carry explicit correlation IDs.
- UI-bound WebView operations should remain on the platform UI thread or main
  actor.
- Be explicit about readiness and lifecycle transitions before sending bridge
  messages.

## Planned But Not Yet Configured

The following directions are intentional, but they are not fully set up in the
repository yet. Agents should treat them as targets, not as already-enforced
infrastructure.

- Linter and formatter configuration is not complete yet for GDScript,
  TypeScript, Kotlin, or Swift.
- GitHub Actions are not configured yet for lint, build, or example smoke
  checks.
- Code generation pipelines for future C# wrappers or shared API declarations do
  not exist yet.
- Binary distribution policy is not finalized yet for Android Maven artifacts,
  local `.aar` files, or iOS plugin packaging outputs.
- An editor-driven generated `gdip` shim flow is being considered for future
  iOS packaging, but it is not implemented yet.
- The example project is planned as the main integration target, but the actual
  runnable Godot example has not been created yet.
