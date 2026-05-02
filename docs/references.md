# References

This file collects the primary official references for `godot-kirie`.

Use these links before relying on memory for engine behavior, Android plugin
packaging, or platform WebView bridge details.

## Godot

- [Godot Android plugins (stable)](https://docs.godotengine.org/en/stable/tutorials/platform/android/android_plugin.html)
  Main reference for Godot Android plugin v2 packaging and export flow.
- [Command line tutorial (stable)](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)
  Reference for `--remote-debug`, command-line running, and export behavior.
- [Overview of debugging tools (stable)](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html)
  High-level reference for remote debugging and editor debugging workflows.
- [Debugger panel (stable)](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/debugger_panel.html)
  Reference for runtime debugger capabilities such as scene inspection and
  stack or variable introspection.
- [EditorSettings (stable)](https://docs.godotengine.org/en/stable/classes/class_editorsettings.html)
  Reference for editor debugger settings such as automatic switching to the
  remote scene tree.
- [EditorExportPlugin (stable)](https://docs.godotengine.org/en/stable/classes/class_editorexportplugin.html)
  Reference for Android export hooks and Apple embedded platform hooks such as
  framework, plist, and C++ code injection.
- [EditorExportPlatformAndroid (stable)](https://docs.godotengine.org/en/stable/classes/class_editorexportplatformandroid.html)
  Android export platform settings, including Gradle build requirements.
- [iOS plugins index (stable)](https://docs.godotengine.org/en/stable/tutorials/platform/ios/index.html)
  Entry point for Godot iOS plugin documentation.
- [Creating iOS plugins](https://docs.godotengine.org/en/stable/tutorials/platform/ios/ios_plugin.html)
  Reference for Godot native iOS plugin entry points and `.xcframework`
  support. Kirie uses addon export hooks instead of a project-local `.gdip`
  shim.
- [EditorExportPlatformIOS (stable)](https://docs.godotengine.org/en/stable/classes/class_editorexportplatformios.html)
  iOS export platform settings reference.
- [C#/.NET (stable)](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html)
  Reference for Godot C# platform support, including Android and iOS export
  limitations.
- [C# signals (stable)](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_signals.html)
  Reference for idiomatic C# event usage when working with Godot signals.
- [Signal class (stable)](https://docs.godotengine.org/en/stable/classes/class_signal.html)
  Reference for Godot signal behavior and cross-language signal concepts.

## Android

- [Android WebView](https://developer.android.com/reference/android/webkit/WebView)
  Primary API reference for WebView lifecycle, `addJavascriptInterface()`, and
  `evaluateJavascript()`.
- [JavascriptInterface](https://developer.android.com/reference/android/webkit/JavascriptInterface)
  Security-critical annotation reference for JavaScript-exposed methods.
- [WebMessage](https://developer.android.com/reference/android/webkit/WebMessage)
  Reference for message payloads when using the platform message APIs.
- [WebMessagePort](https://developer.android.com/reference/android/webkit/WebMessagePort)
  Reference for channel-style messaging on Android WebView.
- [Upload your Android library](https://developer.android.com/studio/publish-library/upload-library)
  Publishing reference for Maven delivery of Android libraries and metadata.
- [Gradle dependency management basics](https://docs.gradle.org/current/userguide/declaring_dependencies_basics.html)
  Reference for module dependencies vs file dependencies and transitive
  dependency behavior.

## Apple

- [WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)
  Primary API reference for embedded web content on Apple platforms.
- [WKScriptMessageHandler](https://developer.apple.com/documentation/webkit/wkscriptmessagehandler)
  Reference for JavaScript-to-native messaging through
  `window.webkit.messageHandlers`.

## .NET

- [Attributes and reflection](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/reflection-and-attributes/)
  Reference for C# attribute metadata and runtime reflection.
- [Native AOT deployment](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/)
  Reference for Native AOT limitations, platform restrictions, and AOT
  compatibility analyzers.
- [Introduction to AOT warnings](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/fixing-warnings)
  Reference for warning categories that flag code patterns that may fail under
  Native AOT.

## JavaScript packaging

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
  Reference for publishing npm packages from GitHub Actions through OIDC instead
  of long-lived npm tokens.
- [GitHub Actions OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)
  Reference for the `id-token: write` permission required to request OIDC
  tokens from GitHub Actions.
- [bumpp](https://github.com/antfu-collective/bumpp)
  Reference for recursive monorepo version bumps, release commits, and tags.
- [pnpm publish](https://pnpm.io/cli/publish)
  Reference for pnpm workspace publishing behavior, including `publishConfig`
  manifest overrides.

## Suggested usage in this repo

- When changing Android plugin packaging, start with the Godot Android plugin
  docs and `EditorExportPlugin`.
- When changing Android IPC, start with `WebView`,
  `JavascriptInterface`, and `WebMessagePort`.
- When changing iOS IPC or packaging, start with `WKWebView`,
  `WKScriptMessageHandler`, and `EditorExportPlugin`.
- When changing the C# wrapper or C# tests, start with Godot C#/.NET platform
  support, C# signals, and .NET reflection or AOT documentation.
- When changing npm package publishing, start with npm trusted publishing,
  GitHub Actions OIDC, bumpp, and pnpm publish behavior.
