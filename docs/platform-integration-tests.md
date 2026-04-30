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
- raw JavaScript bridge IPC
- resource loading through `res://`
- exported app behavior, not editor-only behavior

The tests intentionally do not depend on the browser-facing `@gd-kirie/ipc`
package. That package is a convenience SDK above the raw bridge contract and
should be tested separately.

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
  web/
    probe.html
```

`web/probe.html` is a minimal fixture, not a web app project. There is no Vite
project, package.json, TypeScript config, or generated web bundle under
`tests/integration/web`.

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
- `send_ipc_message(...)`
- `destroy_webview()`

Shared waiting and probe observation lives in `scripts/test_probe.gd`.
`KirieIntegrationProbe` may:

- connect to Kirie signals
- wait for `webview_ready`
- collect `ipc_message_received`
- wait for a specific probe message
- read `web/probe.html`

It should not decide which URL a test loads. Page URLs are test inputs and must
be provided by the test case itself.

## Web Fixture

`web/probe.html` is a small raw bridge fixture. It uses the platform-level
contract directly:

- Android JavaScript to Godot:
  `globalThis.KirieAndroidBridge.postMessage(messageJson)`
- iOS JavaScript to Godot:
  `globalThis.webkit.messageHandlers.kirie.postMessage(messageJson)`
- Godot to JavaScript:
  `kirie:ipc-message` DOM events

For tests that do not care about asset loading, the GDScript case reads
`probe.html` and injects it with `load_html_string(...)`. This keeps the test
case in Godot while preserving HTML/JavaScript syntax highlighting in the
fixture file.

For tests that do care about exported resources, the case loads
`res://web/probe.html?...` with `load_url(...)`.

## Test Coverage Shape

Individual test behavior belongs in `scripts/test_cases/*.gd`, not in this
architecture note.

The suite should stay organized around a small number of platform-facing
coverage categories:

- IPC round trips through the raw JavaScript bridge
- WebView lifecycle transitions driven from Godot
- exported `res://` web resource loading

New tests should add a focused case under `scripts/test_cases/` when they need
different lifecycle operations, a different loaded URL, or a different platform
bridge assertion.

## Android Local Flow

Build the test APK:

```bash
scripts/build_integration_android.sh
```

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

## CI Direction

The intended GitHub Actions shape is:

- set up Node and Java with `jdx/mise-action`
- set up Godot and export templates with `chickensoft-games/setup-godot`
- install pnpm dependencies
- build the Android AAR
- export `tests/integration` as an Android APK
- start an emulator with `reactivecircus/android-emulator-runner`
- install the APK once
- run each test through `scripts/run_integration_android_test.sh`

CI should reuse the same marker contract and app-session isolation used
locally.
