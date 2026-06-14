# Kirie Godot Editor Integration Dream

Status: exploratory. This is not scheduled implementation work.

Related references:

- [EditorPlugin](../references.md#godot)
- [Command line tutorial](../references.md#godot)
- [Vite JavaScript API](../references.md#javascript-packaging)

## Context

This note collects future Godot editor integration ideas for Kirie. The first
concrete dream is replacing the visible run and build workflow with Kirie-aware
actions while preserving native Godot fallbacks.

Kirie CLI is expected to own the one-command local development workflow:

```sh
kirie dev
```

That command starts the Vite development server, resolves the actual web URL,
then launches Godot with Kirie development environment variables. This is the
right shape for terminal-owned development sessions, but it is not the right
shape for a Godot editor session that is already open.

Editor integration should let users keep Godot as the owner of editor run
state, debugging, scene selection, and stop behavior while Kirie owns the web
development and local build inputs around that run.

## Product Direction

When Kirie editor integration is active, the visible run and build actions
should become Kirie actions:

```text
Visible Run   -> Kirie prepares web development, then Godot runs.
Visible Build -> Kirie builds local inputs through `kirie build`.
```

Native Godot actions should remain available, but they should be fallback
actions under the same visible controls rather than separate toolbar buttons.
The intended interaction is similar to a split action button:

```text
[ Run v ]   [ Build v ]
```

The primary click performs the Kirie action. Long press and the dropdown button
open the fallback menu. The dropdown must remain visible because long press is
only an enhancement and should not be the only discoverability path.

## Run Button Direction

The visible Run action should not call the full `kirie dev` command, because
the full CLI session launches Godot as a child process. Inside an already-open
editor, that would create competing owners for the same development session.

Instead, the CLI should provide a web-only mode:

```sh
kirie dev --only-web
```

This mode should:

- read `kirie.config.ts`
- start the Vite development server
- report the resolved URL
- keep the process alive
- shut down cleanly on process termination
- avoid Godot import
- avoid launching Godot
- avoid writing Godot configuration

The editor plugin can then set:

```text
KIRIE_DEV=1
KIRIE_WEB_URL=http://127.0.0.1:<actual-port>/
```

and delegate the actual run to Godot's native run action.

Godot's `EditorPlugin._build()` remains useful as a supported pre-run hook. It
is called before the editor runs the project and can return `false` to abort
the run. Kirie can use this as a guard for normal run flows, but the visible
Kirie Run action should still own the main user experience.

The Run dropdown can contain:

- Run with Kirie
- Run native main scene
- Run native current scene
- Stop running project
- Open Kirie output

## Build Button Direction

The visible Build action should run:

```sh
kirie build
```

`kirie build` remains the aggregate local build command. It should build web
output, build configured or discovered Godot .NET code, and later build other
Kirie-owned local inputs needed by a runnable or exportable project. It should
not export platform packages and should not repair configuration.

There does not appear to be an equivalent public Godot `EditorPlugin` hook that
fires before the native Build button. `EditorPlugin._build()` is specifically a
pre-run hook, not a manual Build-button hook. Because of that, the Build
integration should be implemented by the visible Kirie Build control itself,
not by trying to intercept native build through a supported pre-build callback.

The Build dropdown can contain:

- Build with Kirie
- Build native Godot
- Open Kirie output
- Settings

## Native Fallback Rule

Kirie should treat run and build toolbar replacement as all-or-nothing.

The editor integration may hide native Godot toolbar controls only when it can
also expose native fallback actions from the Kirie dropdowns. If Kirie cannot
find the native controls, preserve their original behavior, and restore them
when the plugin exits, it should not hide or replace the toolbar UI.

In that failure mode, Kirie should report that toolbar replacement is not
available for the current Godot version. It should not add a second parallel set
of Run or Build buttons because that makes the primary workflow ambiguous.

## UI Shape

The split action control should behave like:

- click the main Run area to run with Kirie
- long press the main Run area to open the Run menu
- click the Run dropdown arrow to open the Run menu
- click the main Build area to build with Kirie
- long press the main Build area to open the Build menu
- click the Build dropdown arrow to open the Build menu

Implementation can use a small reusable editor control, for example:

```text
addons/kirie/editor/kirie_split_action_button.gd
```

The control can be built from `Button`, `PopupMenu`, and `Timer`. It should be
an internal editor implementation detail rather than a public Kirie runtime API.

## CLI Output Contract

The editor plugin should not parse human-oriented terminal output to discover
the dev server URL. A web-only dev mode should support a machine-readable ready
file, for example:

```sh
kirie dev --only-web --ready-file .godot/kirie/dev-server.json
```

The file can contain local editor session state:

```json
{
  "url": "http://127.0.0.1:5173/",
  "pid": 12345
}
```

This file belongs in Godot's local metadata area and should not be committed.

## Deferred Questions

- Which Godot versions should Kirie support for toolbar replacement?
- Can native Run and Build controls be found and triggered reliably enough
  across supported Godot versions?
- Should the editor plugin expose settings for the Kirie CLI executable path,
  or should CLI discovery stay convention-only at first?
- How should Kirie surface long-running dev-server output in the editor without
  adding too much UI?
- Should `EditorPlugin._build()` only check Kirie readiness, or should it also
  run `kirie build` before native Run in production-like modes?
- What exact process API should the editor plugin use for long-running
  `kirie dev --only-web` sessions on each desktop platform?
