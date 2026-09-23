# Platform Integration Tests

Kirie platform integration tests live in a repo-level Godot project:

```text
tests/integration/
```

They are not Android instrumentation tests and are not part of
`examples/basic-ipc`. Android, iOS, and desktop Godot CEF coverage should run
the same Godot test project; the platform only provides the WebView runtime and
app launch mechanism.

## Goals

These tests cover the platform bridge path:

```text
Godot -> Kirie platform singleton -> platform WebView -> JavaScript -> Godot
```

The current focus is:

- WebView lifecycle behavior from Godot
- raw WebView IPC lanes
- resource loading through `res://`
- C# wrapper smoke coverage for the same platform bridge path
- exported app behavior, not editor-only behavior

The browser fixture uses `@gd-kirie/ipc` to exercise the text, binary, and data
lanes across the platform runners. The Swift codec also keeps host-side XCTest
coverage for CBOR serialization in the Unit Tests workflow. Eventa adapter
behavior should be tested separately.
Host-window behavior, especially Windows cross-application pointer passthrough,
belongs in an interactive desktop suite rather than this raw bridge suite.

The C# wrapper should be covered by a small exported-app smoke test that uses
`KirieClient` events and verifies the same WebView IPC round-trip as the
GDScript probe. That test is not implemented yet.

## Project Layout

```text
tests/integration/
  project.godot
  export_presets.cfg
  main.tscn
  addons/kirie -> ../../../packages/kirie/addon/addons/kirie
  scripts/
    test_runner.gd
    test_probe.gd
    test_cases/
      ipc_round_trip_probe.gd
      webview_lifecycle_probe.gd
      res_asset_loading_probe.gd
  src-web/
    index.html
    src/main.ts
    dist/
      index.html
      assets/
```

`src-web` is a minimal Vite fixture package, not an example application.
`src-web/dist` is generated output and should not be hand-edited.

## Runner Contract

The exported app runs one test per app session.

The runner reads the test name from the launch option:

```text
kirie_test
```

Kirie exposes this through:

```gdscript
Kirie.get_launch_option("kirie_test")
```

`scripts/test_runner.gd` owns only:

- resolving the test name
- loading `res://scripts/test_cases/<test_name>.gd`
- calling `run(kirie, tree, test_name)`
- printing pass/fail markers
- quitting the app

Test cases return a `String`:

- `""` means pass
- non-empty string means fail reason

The runner prints exactly one final marker:

```text
KIRIE_TEST_PASS <test_name>
KIRIE_TEST_FAIL <test_name> <reason>
```

## Test Case Contract

Each test case owns its own lifecycle operations. A test should explicitly call
the Kirie API it wants to exercise:

- `create_webview()`
- `load_html_string(...)`
- `load_url(...)`
- `send_text(...)`
- `send_binary(...)`
- `send_data(...)`
- `destroy_webview()`

Shared waiting and probe observation lives in `scripts/test_probe.gd`.
`KirieIntegrationProbe` may:

- connect to Kirie signals
- wait for `webview_ready`
- collect text, binary, and data lane messages
- wait for a specific probe message
- read generated web fixture files when a test needs inline HTML

It should not decide which URL a test loads. Page URLs are test inputs and must
be provided by the test case itself.

## Web Fixture

The fixture is built from `src-web` with Vite before integration app export.
It imports `@gd-kirie/ipc`, registers text, binary, and data lane listeners, and
then sends a data-lane `web_ready` probe message. Tests load it through
`res://src-web/dist/?probe=...` so the native resource URL resolver
serves the generated `src-web/dist/index.html`.

## Test Coverage Shape

Individual test behavior belongs in `scripts/test_cases/*.gd`, not in this
architecture note.

The suite should stay organized around a small number of platform-facing
coverage categories:

- IPC round trips through text, binary, and data lanes
- WebView lifecycle transitions driven from Godot
- exported `res://` web resource loading
- C# `KirieClient` event forwarding over the same native singleton path

New tests should add a focused case under `scripts/test_cases/` when they need
different lifecycle operations, a different loaded URL, or a different platform
bridge assertion.

## Android Local Flow

Build the staged Android addon AAR first:

```bash
mise run build:android-aar
```

Build the test APK:

```bash
mise run build:integration-android
```

This task uses the Kirie CLI export path, which builds the configured Vite web
fixture before exporting the Godot project.

Run one test:

```bash
mise run test:integration-android -- ipc_round_trip_probe
```

By default, the local test task:

- runs `kirie run android` through the repo scripts package
- asks the CLI to clear logcat and attach logs for the launched app PID
- asks the CLI to force-stop the package and clear app data
- asks the CLI to install and start the exported app
- passes the test name as the `kirie_test` launch option
- waits for `KIRIE_TEST_PASS` or `KIRIE_TEST_FAIL`

In CI, the emulator job installs the exported APK once before running the
probes. It sets `KIRIE_INTEGRATION_APP_PREINSTALLED=1` so subsequent test tasks
skip installation, but still force-stop the app, clear its data and logcat, and
start a fresh app session for each probe. The CLI prints the `am start` result;
it waits up to 30 seconds for the package PID to allow for emulator cold start.
If the PID does not appear, it also reports startup-related logcat entries.
The longer wait does not establish the cause of any previous PID timeout.

The Android package defaults to:

```text
ai.moeru.kirie.integrationtests
```

The integration project's Android export uses its Mobile renderer setting and
does not force Compatibility mode. Each Android probe checks the active Mobile
renderer and Vulkan driver before exercising Kirie. The CI emulator uses a
software graphics device, so this checks the Godot and WebView integration
path but not physical Android GPU behavior. Godot can fall back to another
renderer when the requested driver is unavailable; the probe fails in that
case rather than reporting a misleading pass. See the
[Godot RenderingServer API](https://docs.godotengine.org/en/stable/classes/class_renderingserver.html#class-renderingserver-method-get-current-rendering-method).

The integration fixture disables Android Swappy frame pacing because Godot
4.7.2 fails to present Vulkan frames on the emulator with `VkResult error 5`
([upstream issue](https://github.com/godotengine/godot/issues/121035)). This
does not change Kirie or application defaults.

TODO (Godot 4.8 upgrade): Remove the frame-pacing override from
`tests/integration/project.godot` and rerun the Android Mobile/Vulkan probes
with Swappy enabled. The [upstream fix](https://github.com/godotengine/godot/pull/121701)
is in 4.8 development builds but not Godot 4.7.2.

The Android launcher component defaults to:

```text
com.godot.game.GodotAppLauncher
```

## Isolation Model

Tests are isolated by app session:

- export one test APK
- install it once in CI (local standalone test tasks install by default)
- run each test in a fresh app start
- run `pm clear` before each test

This avoids residual WebView, JavaScript, singleton, signal, and cache state
without exporting a separate APK for every test.

## iOS Local Flow

Build the staged iOS debug addon XCFramework first:

```bash
mise run build:ios-debug-xcframework
```

Build the simulator app:

```bash
mise run build:integration-ios
```

This task uses the Kirie CLI export path, which builds the configured Vite web
fixture before exporting the Godot project.

The iOS integration runner is currently simulator-specific because it
uses the Kirie CLI run helpers to launch with the `kirie_test` option, then
streams logs for the pass/fail marker. Each local and CI probe installs the
exported app, waits for the simulator to see it, and starts a fresh app session.
The runner distinguishes a missing `KIRIE_TEST_START` (failure before the test
runner is observed) from a test
that starts but never prints a final marker. The example runner
currently shares this simulator export path, but that is a tooling shortcut
rather than a desired examples API shape. Examples should not be treated as
inherently simulator-only.

Apple's iOS Simulator supports Metal, but Godot 4.7.2 disables its Metal and
Vulkan drivers in simulator builds ([Apple](https://developer.apple.com/documentation/metal/developing-metal-apps-that-run-in-simulator),
[Godot source](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/ios/detect.py#L143-L158)).
The CI simulator app therefore uses Compatibility/OpenGL ES 3.0, even though
the integration project selects Mobile for iOS. These probes test Kirie's
WebView and IPC paths, not Mobile/Metal rendering. The iOS XCFramework includes
a device build, but this CI does not run the app on a physical device.

Install and run tests with the iOS test task:

```bash
mise run test:integration-ios -- ipc_round_trip_probe
```

Build the exported app before running a test. CI skips the test task's package
build dependency because the export task has already built the packages.

The iOS XCFramework and simulator app tasks expect the Godot source checkout at
repo-root `godot/`.

## Desktop Godot CEF Local Flow

Install the pinned Godot CEF addon into the test project:

```bash
mise run install:godot-cef tests/integration
```

Build the browser fixture:

```bash
mise run build:integration-web
```

Run a test with the headless Godot desktop runtime:

```bash
mise run test:integration-desktop ipc_round_trip_probe
```

Run the desktop CI smoke set:

```bash
mise run test:integration-desktop ipc_round_trip_probe
mise run test:integration-desktop webview_lifecycle_probe
mise run test:integration-desktop res_asset_loading_probe
```

For a local single-test run, the desktop runner first performs a headless editor
import so Godot discovers GDExtensions such as Godot CEF. Desktop CI imports the
project once before the smoke set and sets `KIRIE_DESKTOP_SKIP_IMPORT=true` for
the test commands. Each test still launches a fresh runtime with `--headless`,
passes `--kirie-test=<name>` as a Godot user argument, captures stdout, and
waits for `KIRIE_TEST_PASS` or `KIRIE_TEST_FAIL`.

## CI Direction

The CI flows live in:

- `.github/workflows/platform-integration-android.yml`
- `.github/workflows/platform-integration-ios.yml`
- `.github/workflows/platform-integration-desktop.yml`

Android and iOS build the native staging artifacts before exporting the
integration project.

Desktop CI runs the same Godot CEF smoke set on macOS, Windows, and Linux:
`ipc_round_trip_probe`, `webview_lifecycle_probe`, and
`res_asset_loading_probe`.

CI should reuse the same marker contract and app-session isolation used
locally.
