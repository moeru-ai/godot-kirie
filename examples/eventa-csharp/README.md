# eventa-csharp

Beginner-friendly Kirie Eventa demo project for Godot C# projects.

This example requires the .NET 10 SDK because `GdKirie.EventaAdapter` directly
depends on the upstream `Eventa` package, which targets `net10.0`. Projects that
target `net8.0` or `net9.0` are expected to fail package restore or build when
they reference the adapter.

The example is intentionally separate from exported Android and iOS integration
tests. It demonstrates the first Eventa adapter path:

1. Godot creates a single WebView.
2. The WebView page emits `web:ready` through `@gd-kirie/ipc-eventa`.
3. The C# scene receives that Eventa event through `GdKirie.EventaAdapter`.
4. The WebView invokes `godot:echo`, handled by C#.
5. The C# scene can invoke `web:echo`, handled by the WebView.

## Running

Build the web page first:

```sh
mise x -- corepack pnpm --filter @gd-kirie/eventa-csharp-web run build
```

Open the Godot project:

```sh
mise x -- godot ./examples/eventa-csharp/project.godot
```

Run the scene and press `Create WebView`.

Build, install, and launch the exported Android example:

```sh
mise run run:example -- android eventa-csharp
```

Build, install, and launch the exported iOS simulator example:

```sh
mise run run:example -- ios eventa-csharp
```

This iOS example runner is currently simulator-only because it reuses the same
local Godot iOS export path used by integration testing. That is a tooling
shortcut, not a design requirement for examples. Manual example runs should
eventually allow the most useful local target, such as an iOS Simulator, a real
iOS device, or an iOS app running directly on an Apple Silicon Mac.
