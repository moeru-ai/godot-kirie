# Platform Integration Tests

Kirie platform integration tests live in a repo-level Godot project:

```text
tests/integration/
```

They are not Android instrumentation tests and are not part of
`examples/basic-ipc`. Android and iOS should eventually run the same Godot test
project; the platform only provides the WebView runtime and app launch
mechanism.

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

The browser fixture currently targets the Android CBOR ArrayBuffer lane path:
it uses `@gd-kirie/ipc` to encode and decode text, binary, and data lane
messages. The Godot side still verifies the exported app bridge through
Kirie's explicit lane API. iOS has a native XCTest coverage point for CBOR
serialization, but the WebView transport still uses the legacy text-oriented
native bridge and is not expected to pass this Vite fixture until the iOS lane
migration lands. Eventa adapter behavior should be tested separately above the
raw bridge.

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
  web-src/
    index.html
    src/probe.ts
  web/
    index.html
    assets/
```

`web-src` is a minimal Vite fixture package, not an example application.
`web` is generated output and should not be hand-edited.

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

The fixture is built from `web-src` with Vite before integration app export.
It imports `@gd-kirie/ipc`, registers text, binary, and data lane listeners, and
then sends a data-lane `web_ready` probe message. Tests load it through
`res://web/?probe=...` so the native resource URL resolver serves the generated
`web/index.html`.

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

This task builds the Vite web fixture before exporting the Godot project.

Install it once:

```bash
adb install -r dist/integration/android_debug.apk
```

Run one test:

```bash
scripts/run_integration_android_test.sh ipc_round_trip_probe
```

The run script:

- clears logcat
- force-stops the package
- clears app data
- starts the exported app with `--es kirie_test <test_name>`
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

By default this uses the `iPhone 16` simulator destination. Override the
destination when a local machine has a different simulator:

```bash
IOS_TEST_DESTINATION="platform=iOS Simulator,name=iPhone 15" \
  mise run test:ios-ipc-serialization
```

Build the staged iOS addon XCFramework first:

```bash
mise run build:ios-xcframework
```

Build the simulator app:

```bash
mise run build:integration-ios
```

This task also builds the Vite web fixture before exporting the Godot project.

Install and run tests with the simulator helper:

```bash
scripts/run_integration_ios_test.sh ipc_round_trip_probe
```

The iOS XCFramework and simulator app tasks expect the Godot source checkout at
repo-root `godot/`.

## CI Direction

The CI flows live in `.github/workflows/platform-integration-android.yml` and
`.github/workflows/platform-integration-ios.yml`. They build the native staging
artifacts before exporting the integration project.

CI should reuse the same marker contract and app-session isolation used
locally.
