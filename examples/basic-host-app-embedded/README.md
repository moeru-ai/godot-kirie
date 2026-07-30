# Native-hosted Godot and Kirie prototype

This example proves the same native-hosted model on iOS and Android. SwiftUI or
Kotlin owns the application entry point and embeds one Godot surface. The Godot
C# scene then creates the platform Kirie WebView inside that surface and uses
Eventa.NET over Kirie text IPC.

It visibly exercises four layers in one process:

1. SwiftUI or Kotlin owns the application scene and native header.
2. UIKit `GDTViewController` or Android `GodotFragment` embeds one Godot engine.
3. Godot renders and animates the background surface.
4. Kirie renders the transparent web card and carries Eventa.NET traffic.

The header's layer button switches the embedded SwiftUI/Kotlin overlay and
Kirie host stacking order. Hit testing follows the selected top layer where
they overlap. The header stays outside the Kirie host, so it remains interactive
in either order.

The web and C# sides each emit and acknowledge a normal Eventa event and handle
a unary invoke. After both invoke directions and the event acknowledgement
complete, the Godot process prints
`KIRIE_VIEW_EMBED_EVENTA_PASS`.

## Why this uses a custom Godot build

The example follows the proven single-instance Apple embedded lifecycle from
the Godot fork's `ios_embed_dotnet` prototype. The native `@main` target uses
`@UIApplicationDelegateAdaptor(GDTApplicationDelegate.self)`, stores one global
`GDTViewController`, and exposes it through `UIViewControllerRepresentable`.
Godot's .NET iOS exporter still owns the PCK and NativeAOT XCFramework.

This is not a multi-engine LibGodot API. One process owns one Godot engine and
one current Godot view controller.

The current Eventa.NET package targets `net10.0`, so this example intentionally
uses `Godot.NET.Sdk/4.7.0-beta` with `net10.0`. Its iOS NativeAOT export is part
of the runtime verification, not inferred from the desktop Eventa example.

The project explicitly compiles the adapter's NuGet `contentFiles` source
bridge alongside its local `ProjectReference`, because project references do
not import NuGet `contentFiles`. The scene still owns one `KirieNode`, while
`KirieClient.FromNode(...)` provides the typed C# API over that existing node.
The same client creates the Eventa context, so the example needs neither a
second WebView nor a local `IKirieTextTransport` implementation.

## Simulator

Point the task at a checkout of
`nekomeowww/godot:dev/ios-swift-and-csharp-dotnet` with the editor, iOS debug
template, and local Godot NuGet packages prepared as described by that branch:

```sh
GODOT_EMBED_SOURCE_ROOT=/path/to/nekomeowww/godot \
DOTNET_BIN=/path/to/dotnet-10.0.201/dotnet \
mise run run:basic-host-app-embedded-ios-simulator
```

The task builds the web page, stages a read-only copy of the project and addon
under `dist/`, rebuilds only that staged Kirie framework against the checkout's
Godot 4.7 headers, restores and builds the C# project, and performs a
project-only Godot iOS export. It then installs the native Swift host sources,
builds with Xcode, deploys with `simctl`, waits for the Eventa marker, and saves
a screenshot under `dist/examples/basic-host-app-embedded/`. The source project's
Godot configuration and the repository's normal addon artifacts are not
rewritten.

Set `SIMULATOR_ID` to select a specific available iPhone simulator. Otherwise a
booted iPhone is preferred, followed by the newest available runtime.

## Device

The device task needs both identifiers because Xcode uses the hardware UDID
while CoreDevice commands use the `devicectl` identifier:

```sh
GODOT_EMBED_SOURCE_ROOT=/path/to/nekomeowww/godot \
DOTNET_BIN=/path/to/dotnet-10.0.201/dotnet \
IOS_TEAM_ID=YOUR_TEAM_ID \
IOS_BUNDLE_ID=your.owned.bundle.identifier \
IOS_XCODE_DEVICE_ID=HARDWARE_UDID \
IOS_CORE_DEVICE_ID=COREDEVICE_IDENTIFIER \
mise run run:basic-host-app-embedded-ios-device
```

The iPhone must be connected, paired, trusted, unlocked, and in Developer Mode.
The task signs, installs, and launches the app through `devicectl`. Godot logs
on a real device should be verified through Apple Unified Logging or an Xcode
Logging trace; `devicectl --console` does not reliably capture `GD.Print`.

## Android Emulator

The Android host is maintained in
`android-host/GodotApp.kt`. During export the build copies it over
the generated `com.godot.game.GodotApp` source, while preserving the launcher
alias expected by Godot's Gradle template. The Kotlin Activity owns a native
header, embeds one `GodotFragment`, and can move a native overlay above or below
the Godot/Kirie region.

Kirie implements `GodotPlugin.onMainCreate()` and returns a plugin-owned
`FrameLayout`. Existing and newly created WebViews are attached to that layout,
so an embedded app does not accidentally cover the native header. Changing the
two sibling views' elevation switches both drawing and touch ownership.

The replacement Activity must retain initialization normally supplied by
Godot's generated `GodotApp.java`: it installs the AndroidX splash screen,
loads `System.Security.Cryptography.Native.Android` for Mono exports, enables
edge-to-edge drawing, and forwards system-bar updates after the Godot main loop
starts. Omitting the native cryptography load causes Eventa's ID generation to
abort the process when its dependencies first request secure randomness.

Install Android Studio's SDK, platform tools, emulator, an arm64 system image,
and Java 21. Configure Godot's Android Java SDK path, then build this fork's
matching Android Mono template. The source archive and editor must come from
the same Godot checkout:

```sh
cd /path/to/nekomeowww/godot
python3 misc/scripts/install_swappy_android.py
scons platform=android target=template_debug arch=arm64 \
  module_mono_enabled=yes swappy=yes generate_android_binaries=yes
```

With an AVD installed, run:

```sh
GODOT_EMBED_SOURCE_ROOT=/path/to/nekomeowww/godot \
ANDROID_HOME="$HOME/Library/Android/sdk" \
mise run run:basic-host-app-embedded-android-emulator
```

The task prefers an already booted emulator. Otherwise it starts the first
available AVD and waits for Android to finish booting. Set `ANDROID_DEVICE_ID`
to target a particular connected emulator. It builds the web UI and Kirie AAR,
exports the arm64 Mono APK with the custom Gradle source template, installs and
launches it, waits for the Eventa marker, and writes the APK, logs, and screenshot
under `dist/examples/basic-host-app-embedded/android/`.

## Upstream references

- [Verified SwiftUI + Godot .NET prototype](https://github.com/nekomeowww/godot/commit/6e7a65fa87361d1a063d44636aaf433e857478aa)
- [Godot Apple embedded application source](https://github.com/nekomeowww/godot/blob/6e7a65fa87361d1a063d44636aaf433e857478aa/drivers/apple_embedded/app.swift)
- [Godot Apple embedded lifecycle service](https://github.com/nekomeowww/godot/blob/6e7a65fa87361d1a063d44636aaf433e857478aa/drivers/apple_embedded/app_delegate_service.mm)
- [Godot iOS .NET export implementation](https://github.com/nekomeowww/godot/blob/6e7a65fa87361d1a063d44636aaf433e857478aa/modules/mono/editor/GodotTools/GodotTools/Export/ExportPlugin.cs)
- [Apple `UIViewControllerRepresentable`](https://developer.apple.com/documentation/swiftui/uiviewcontrollerrepresentable)
- [Godot: embedding as an Android library](https://docs.godotengine.org/en/stable/tutorials/platform/android/android_library.html)
- [Godot: compiling for Android](https://docs.godotengine.org/en/stable/engine_details/development/compiling/compiling_for_android.html)
- [Godot Android `GodotApp.java` lifecycle template](https://github.com/godotengine/godot/blob/master/platform/android/java/app/src/main/java/com/godot/game/GodotApp.java)
- [AndroidX splash screen migration](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
- [Eventa.NET](https://github.com/moeru-ai/eventa.net)
