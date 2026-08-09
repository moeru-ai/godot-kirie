# Native-hosted Godot and Kirie prototype

This example proves the same native-hosted model on iOS and Android. SwiftUI or
Kotlin owns the application entry point and embeds one Godot surface. The Godot
C# scene then creates the platform Kirie WebView inside that surface and uses
Eventa.NET over Kirie text IPC.

It visibly exercises four layers in one process:

1. SwiftUI or Kotlin owns the application scene and transparent native overlay.
2. UIKit `GDTViewController` or Android `GodotFragment` fills the window with one Godot engine.
3. Godot renders and animates the full-screen background surface.
4. Kirie renders the transparent web card and carries Eventa.NET traffic.

Small SwiftUI/UIKit or Kotlin/Android controls float above the Godot and Kirie
surfaces. Only those controls claim native hits; transparent space remains
available to the WebView and to pointer input forwarded into Godot.

The web and C# sides each emit and acknowledge a normal Eventa event and handle
a unary invoke. After both invoke directions and the event acknowledgement
complete, the Godot process prints
`KIRIE_VIEW_EMBED_EVENTA_PASS`.

The example owns the native-host preparation that is specific to this prototype.
Dependencies and versions come from the repository workspace and catalog. Install
them once from the repository root:

```sh
mise x -- corepack pnpm install --frozen-lockfile
```

No example-specific tasks are registered in the repository's root `mise.toml`.
The example still intentionally consumes the Kirie addon and C# Eventa adapter
from this checkout, so it is self-contained as a repository example rather than
a directory that can be copied out of the monorepo unchanged.

Run `prepare:ios` or `prepare:android` once after changing Godot, C#, native host,
plugin, or export inputs. These commands stage the project and produce the native
project or APK, but do not select devices, install, launch, wait for logs, or take
screenshots. Use the platform tools directly for the shorter iteration loops
below.

For web-only iteration, keep Vite running in a separate terminal:

```sh
mise x -- corepack pnpm -F @gd-kirie/basic-host-app-embedded-web exec vite --host 0.0.0.0
```

iOS Simulator can use `http://127.0.0.1:5173/`. Android Emulator uses
`http://10.0.2.2:5173/`. A physical iOS device must use the Mac's reachable LAN
address.

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

## Prepare iOS

Point the task at a checkout of
`nekomeowww/godot:dev/ios-swift-and-csharp-dotnet` with the editor, iOS debug
template, and local Godot NuGet packages prepared as described by that branch:

```sh
GODOT_EMBED_SOURCE_ROOT=/path/to/nekomeowww/godot \
DOTNET_BIN=/path/to/dotnet-10.0.201/dotnet \
IOS_BUNDLE_ID=your.owned.bundle.identifier \
mise x -- corepack pnpm --dir examples/basic-host-app-embedded prepare:ios
```

This builds the web page, stages a read-only copy of the project and addon under
`dist/`, rebuilds the staged Kirie framework against the checkout's Godot 4.7
headers, restores and builds C#, performs the Godot iOS export, and installs the
Swift host sources. It leaves the reusable Xcode project at
`dist/examples/basic-host-app-embedded/ios_xcode/`.

The source project's Godot configuration and the repository's normal addon
artifacts are not rewritten.

### iOS Simulator loop

Choose a simulator with `xcrun simctl list devices available`, then incrementally
build with a stable DerivedData path:

```sh
xcodebuild \
  -project dist/examples/basic-host-app-embedded/ios_xcode/BasicHostAppEmbedded.xcodeproj \
  -scheme BasicHostAppEmbedded \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination id=SIMULATOR_UDID \
  -derivedDataPath dist/examples/basic-host-app-embedded/DerivedData-simulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Install and launch the result:

```sh
xcrun simctl install SIMULATOR_UDID \
  dist/examples/basic-host-app-embedded/DerivedData-simulator/Build/Products/Debug-iphonesimulator/BasicHostAppEmbedded.app

xcrun simctl launch --terminate-running-process SIMULATOR_UDID \
  your.owned.bundle.identifier \
  --kirie-web-url=http://127.0.0.1:5173/
```

### iOS device loop

The iPhone must be connected, paired, trusted, unlocked, and in Developer Mode.
Xcode uses the hardware UDID while `devicectl` uses its CoreDevice identifier.

```sh
xcodebuild \
  -project dist/examples/basic-host-app-embedded/ios_xcode/BasicHostAppEmbedded.xcodeproj \
  -scheme BasicHostAppEmbedded \
  -configuration Debug \
  -sdk iphoneos \
  -destination id=HARDWARE_UDID \
  -derivedDataPath dist/examples/basic-host-app-embedded/DerivedData-device \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  build

xcrun devicectl device install app --device COREDEVICE_IDENTIFIER \
  dist/examples/basic-host-app-embedded/DerivedData-device/Build/Products/Debug-iphoneos/BasicHostAppEmbedded.app

xcrun devicectl device process launch \
  --device COREDEVICE_IDENTIFIER \
  --terminate-existing \
  --console \
  your.owned.bundle.identifier \
  --kirie-web-url=http://YOUR_MAC_LAN_IP:5173/
```

Godot logs on a real device should be verified through Apple Unified Logging or
an Xcode Logging trace; `devicectl --console` does not reliably capture
`GD.Print`.

## Android Emulator

The Android host is maintained in `android-host/GodotApp.kt`. During export the build copies it over
the generated `com.godot.game.GodotApp` source, while preserving the launcher
alias expected by Godot's Gradle template. The Kotlin Activity fills a transparent
`FrameLayout` with one `GodotFragment`, then places only its small native controls
above the Godot/Kirie region.

Kirie implements `GodotPlugin.onMainCreate()` and returns a plugin-owned
`FrameLayout`. Existing and newly created WebViews are attached to that layout,
while the Activity's floating controls remain later, elevated siblings and keep
their own touch ownership.

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

## Prepare Android

With the matching Godot Android Mono template built, prepare the APK once:

```sh
GODOT_EMBED_SOURCE_ROOT=/path/to/nekomeowww/godot \
ANDROID_HOME="$HOME/Library/Android/sdk" \
DOTNET_BIN=/path/to/dotnet-10.0.201/dotnet \
mise x -- corepack pnpm --dir examples/basic-host-app-embedded prepare:android
```

The output is
`dist/examples/basic-host-app-embedded/android/ViewEmbedded-debug.apk`.

### Android Emulator loop

Start an AVD through Android Studio or the `emulator` command, then find its
serial:

```sh
"$ANDROID_HOME/platform-tools/adb" devices -l
```

Install the prepared APK:

```sh
"$ANDROID_HOME/platform-tools/adb" -s emulator-5554 install -r \
  dist/examples/basic-host-app-embedded/android/ViewEmbedded-debug.apk
```

Launch the packaged page:

```sh
"$ANDROID_HOME/platform-tools/adb" -s emulator-5554 shell am start -S \
  -n ai.moeru.kirie.examples.viewembedded/com.godot.game.GodotAppLauncher
```

Or launch against the running Vite server for web-only iteration:

```sh
"$ANDROID_HOME/platform-tools/adb" -s emulator-5554 shell am start -S \
  -n ai.moeru.kirie.examples.viewembedded/com.godot.game.GodotAppLauncher \
  --es kirie-web-url http://10.0.2.2:5173/
```

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
