---
status: "accepted"
date: 2026-09-27
decision-makers: "LemonNeko"
consulted: "Codex, Lody"
informed: "Kirie contributors"
---

# Run integration tests through ViDot and a unified Kirie launcher

## Context

Kirie's custom integration runner starts a new application session for each
probe. Application and emulator startup dominate the suite, especially in
headless CI.

The replacement must exercise the real desktop, Android, and iOS WebView
implementations. It must avoid separate test frameworks or lifecycle models for
different targets.

ViDot already provides Vitest integration, TypeScript-to-GDScript compilation,
test collection and execution, structured test events, and a scene-tree root
for each test. Kirie only needs to adapt ViDot's application launch to Kirie's
three runtime targets.

## Decision

Create `@gd-kirie/vitest` as a launch adapter around `@vidot/vitest`.

The adapter supports desktop, Android, and iOS from its first version. Target
selection is optional. An omitted target selects desktop. The same default
applies to `kirie run`:

```sh
kirie run
kirie run desktop
kirie run android
kirie run ios
```

All targets use the same test suite, ViDot runner, event protocol, and Kirie
launcher boundary. A complete suite runs in one application process. The
launcher may stage generated test resources for targets that cannot read host
temporary files, but those resources exist only for the test run.

ViDot remains responsible for compilation, collection, hooks, assertions,
execution, and Vitest events. Kirie remains responsible for exporting,
installing, launching, stopping, and reading output from its applications. The
adapter translates only the paths and process output needed to connect those
two responsibilities. The adapter does not invoke Godot, `adb`, or `xcrun`
directly.

Each test adds its `KirieNode` instances directly below ViDot's
`context.root`. ViDot releases that root after the test, which releases the
scene-owned WebViews. Kirie trusts this ownership contract and does not add a
fixture wrapper, cleanup registry, fallback destruction path, or duplicate
test of ViDot's node cleanup.

Collection uses the same launcher path as execution. The adapter does not copy
or replace ViDot's collector.

## Consequences

- One application startup covers the complete suite instead of one startup per
  test.
- Desktop, Android, and iOS share one test and lifecycle model.
- ViDot and Kirie retain separate responsibilities, so neither package copies
  the other's runner or platform launcher.
- Mobile targets must package generated tests before the application starts.
- The adapter must map between host paths and packaged resource paths.
- Process-level state persists across tests, while nodes owned by a test do
  not.

## Rejected Alternatives

### Keep the custom runner

This retains the dominant startup cost and repository-specific collection,
reporting, and timeout logic.

### Use ViDot only on desktop

This splits mobile and desktop into different test frameworks and encourages
tests to depend on the desktop resource model.

### Implement a Kirie-specific Vitest pool

This duplicates ViDot's compiler, collector, task mapping, cancellation, and
event protocol.

### Isolate every test in a new process

This preserves the startup cost that motivated the change. Scene-tree
ownership provides the required per-test WebView lifetime without restarting
the application.

## References

- [ViDot repository](https://github.com/LemonNekoGH/vidot)
- [Godot command-line tutorial](https://docs.godotengine.org/en/4.7/tutorials/editor/command_line_tutorial.html)
