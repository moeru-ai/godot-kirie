# Kirie IPC Interaction TestKit Dream

Status: exploratory. This is not scheduled implementation work.

Related references:

- [Godot C#/.NET](../references.md#godot)
- [.NET attributes and Native AOT](../references.md#net)

## Context

Kirie is expected to serve web-led Godot projects. In that shape, the web app is
not just embedded content. It owns much of the application behavior, while Godot
hosts scenes, native platform capabilities, and rendering surfaces.

That means real projects will eventually need to test WebView JavaScript, Kirie
IPC, Godot scene state, and C# project code as one integrated system.

The current repository integration tests are still lower level. They validate
that Kirie can create a platform WebView, exchange raw IPC messages, and load
packaged `res://` web resources. A future public TestKit would sit above that
foundation.

## Product Direction

The likely public TestKit should be an IPC interaction framework, not a full E2E
runner:

- Kirie focuses on WebView JavaScript, Godot, and C# IPC correctness.
- JavaScript and Godot or C# tests can drive both sides of the interaction.
- Request and response flows carry explicit correlation IDs.
- Timeouts, lifecycle readiness, and error propagation are first-class test
  concerns.
- Godot and C# expose test-only adapters for scene control and state queries.
- Kirie owns a single fixed HTML runner.
- Users do not write per-test HTML files.
- Users do not maintain a JSON manifest for test pairing.
- Runtime C# reflection discovery is avoided for mobile AOT safety.
- Built-in conformance tests remain available as installation and upgrade
  checks.
- A small E2E adapter can expose Kirie IPC checks to external E2E frameworks.

The goal is not to become a general Godot testing framework or a full
device-level E2E runner. The goal is to make Kirie-specific IPC interactions
observable, scriptable, and reusable from project tests and external E2E tools.

## Intended User Shape

An application might contain:

```text
kirie_tests/
  web/
    scene_selection.kirie.test.ts
    inventory_panel.kirie.test.ts
    camera_sync.kirie.test.ts
  godot/
    SceneTestAdapter.cs
```

The web side can drive an IPC interaction:

```ts
kirieTest("scene_selection", async (t) => {
  await t.godot.call("scene.load", { name: "gallery" });
  await t.mountWebApp();

  await t.godot.call("scene.select_object", { id: "cube_01" });

  await t.expect.dom("#selected-name").toHaveText("cube_01");
  await t.expect.godot("scene.selected_object").toEqual("cube_01");
});
```

The Godot or C# side provides reusable adapters for state changes and queries:

```csharp
public partial class SceneTestAdapter : Node
{
    public override void _Ready()
    {
        KirieTestHost.Register("scene.load", LoadScene);
        KirieTestHost.Register("scene.select_object", SelectObject);
        KirieTestHost.Register("scene.selected_object", GetSelectedObject);
    }
}
```

## Runtime Model

The core IPC interaction flow would look like:

1. A host runner starts the user's exported Godot app with a Kirie test launch
   option.
2. A Kirie test autoload detects test mode.
3. Kirie creates the WebView and loads the framework-owned runner HTML.
4. The runner HTML loads the generated web test bundle.
5. The requested test drives one or more IPC interactions.
6. Calls such as `t.godot.call(...)` go through a Kirie test control protocol.
7. Godot or C# adapters execute scene actions and return results.
8. The web test asserts DOM state, web app state, and Godot state.
9. The runner prints stable pass or fail markers for automation.

The fixed HTML runner is part of Kirie. Test differences live in the generated
JavaScript bundle and in project adapters.

## E2E Adapter Research

Kirie should not own the full E2E path. Device-level tools should remain
responsible for app launch, real user gestures, screenshots, permission dialogs,
backgrounding, and complete user journeys.

The exact adapter design is deferred. Before defining this surface, study the
real extension and integration models of target E2E tools, especially Playwright
and Detox:

- how they launch apps, browsers, devices, and WebViews
- whether they have fixtures, plugins, drivers, or only helper APIs
- whether they can call external commands or helper libraries during a test
- how they read app-internal state, logs, screenshots, traces, and structured
  results
- how WebView inspection works on Android and iOS
- how failure reports can include Kirie diagnostics

Only after that research should Kirie define a convenience adapter such as a
Playwright fixture, Detox helper, or CLI wrapper.

The high-level composition may still look like:

```text
Playwright, Maestro, Detox, XCTest, or UIAutomator
  -> launches and drives the app
  -> enters a Kirie test or diagnostic mode
  -> calls the Kirie IPC interaction adapter
  -> reads stable pass, fail, and diagnostic results
```

The likely Kirie-specific pieces are:

- WebView runner readiness
- IPC request and response assertions
- Godot or C# adapter calls
- structured IPC errors and timeouts
- stable result markers for log scraping or framework assertions

Full E2E tests can then compose Kirie IPC checks into broader user journeys
without making Kirie responsible for the whole device automation stack.

## Discovery Direction

The preferred user experience is convention-based discovery:

- web tests are discovered from files such as `*.kirie.test.ts`
- Godot and C# adapters are loaded as normal project code
- adapter methods are registered explicitly at runtime
- generated indexes may be used internally, but users should not hand-maintain a
  test manifest

This avoids per-test HTML files and avoids runtime C# reflection scans. C#
attributes may still be useful as an editor-time or build-time declaration
syntax, but exported mobile apps should use generated registries or explicit
registration rather than reflection-based discovery.

## Protocol Direction

The test control protocol should be separate from application IPC messages.
Likely fields:

```json
{
  "__kirie_test": true,
  "call_id": "scene_selection:1",
  "type": "call",
  "method": "scene.select_object",
  "payload": {
    "id": "cube_01"
  }
}
```

Responses should carry the same correlation ID and either a result payload or a
structured error.

This keeps application IPC free to evolve while the TestKit has stable
automation semantics.

## When Users Would Use It

This TestKit is most useful when a project has meaningful WebView and Godot IPC
interaction, for example:

- web UI controls Godot scene state
- Godot scene events update web UI
- a TypeScript app drives in-game panels or tools
- packaged web resources need to work on Android and iOS
- C# project code acts as the bridge between web behavior and scene behavior
- Kirie, Godot, Android, iOS, or WebView dependencies are upgraded
- external E2E tests need to assert Kirie-specific interaction details

For simpler plugin validation, built-in conformance or doctor checks are still
the better entry point.

## Deferred Questions

- What is the smallest useful `@gd-kirie/testkit` web API?
- Should the first web test runner use an existing test assertion library or a
  tiny Kirie-owned assertion surface?
- How should generated web bundles be produced without forcing a specific
  frontend stack too early?
- How much of the host runner belongs in a CLI versus Godot editor tooling?
- What is the iOS automation story for simulator and real device runs?
- How should tests opt into loading the user's real web app inside the fixed
  Kirie runner HTML?
- What do Playwright and Detox actually need from Kirie: fixture APIs, helper
  libraries, launch arguments, log markers, structured result files, or a CLI?
