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
lanes across the platform runners. iOS also keeps a native XCTest coverage point
for CBOR serialization, but that runs in the Unit Tests workflow rather than the
platform integration workflows. Eventa adapter behavior should be tested
separately.

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

On Android, the runner reads the test name from the launch option:

```text
kirie_test
```

The Android plugin exposes this through:

```gdscript
Kirie.get_launch_option("kirie_test")
```

The runner also supports `--kirie-test=<name>` from Godot command-line user
args for local non-Android runs.

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

The test task:

- runs `kirie run android` through the repo scripts package
- asks the CLI to clear logcat and attach logs for the launched app PID
- asks the CLI to force-stop the package and clear app data
- asks the CLI to install and start the exported app
- passes the test name as the `kirie_test` launch option
- waits for `KIRIE_TEST_PASS` or `KIRIE_TEST_FAIL`

The Android package defaults to:

```text
ai.moeru.kirie.integrationtests
```

The Android launcher component defaults to:

```text
com.godot.game.GodotAppLauncher
```

## Isolation Model

Tests are isolated by app session:

- export one test APK
- install it once
- run each test in a fresh app start
- run `pm clear` before each test

This avoids residual WebView, JavaScript, singleton, signal, and cache state
without exporting a separate APK for every test.

## iOS Local Flow

Run the native iOS CBOR serialization test:

```bash
mise run test:ios-ipc-serialization
```

This is unit-style XCTest coverage for the Swift codec, not an exported-app
platform integration test.

By default this uses the `iPhone 16` simulator destination. Override the
destination when a local machine has a different simulator:

```bash
IOS_TEST_DESTINATION="platform=iOS Simulator,name=iPhone 15" \
  mise run test:ios-ipc-serialization
```

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
uses the Kirie CLI run helpers to install and launch with the `kirie_test`
launch option, then streams logs for the pass/fail marker. The example runner
currently shares this simulator export path, but that is a tooling shortcut
rather than a desired examples API shape. Examples should not be treated as
inherently simulator-only.

Install and run tests with the iOS test task:

```bash
mise run test:integration-ios -- ipc_round_trip_probe
```

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
mise run test:integration-desktop res_asset_loading_probe
```

The desktop runner first performs a headless editor import so Godot discovers
GDExtensions such as Godot CEF, then launches the runtime with `--headless`,
captures stdout, and waits for `KIRIE_TEST_PASS` or `KIRIE_TEST_FAIL`.

## CI Direction

The CI flows live in:

- `.github/workflows/platform-integration-android.yml`
- `.github/workflows/platform-integration-ios.yml`
- `.github/workflows/platform-integration-desktop.yml`

Android and iOS build the native staging artifacts before exporting the
integration project.

Desktop CI runs the same Godot CEF smoke set on macOS, Windows, and Linux:
`ipc_round_trip_probe` and `res_asset_loading_probe`. Keep
`webview_lifecycle_probe` out of desktop CI until Godot CEF's browser and CEF
runtime lifecycles are stable enough for destroy/recreate coverage.

CI should reuse the same marker contract and app-session isolation used
locally.
