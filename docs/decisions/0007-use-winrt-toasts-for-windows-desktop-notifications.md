---
status: "proposed"
date: 2026-09-22
decision-makers: "LemonNeko"
consulted: "Codex"
informed: "Kirie contributors"
---

# Use WinRT toasts for Windows desktop notifications

## Context and Problem Statement

[ADR-0004](0004-add-macos-desktop-notifications.md) added
`notifications.show()` and `notifications.onActivated()` and left Windows as a
separate backend decision. Godot exports an unpackaged executable, and the
existing contract only delivers a click while the Platform host is alive.
[ADR-0006](0006-export-platform-inbound-events-as-eventa-contracts.md) later
replaced that subscription with the `notificationActivated` contract and left
the native callback this decision adds unchanged.

`Microsoft.WindowsAppSDK` is the current packaged-app API, but it requires a
Windows target framework and the Windows App SDK runtime.
`Microsoft.Toolkit.Uwp.Notifications` is the older unpackaged .NET package, and
its maintainers now point callers at the Windows App SDK. Neither package fits
`GdKirie.Platform`, which is one `net10.0` assembly built for every desktop
platform.

## Decision

On Windows 10 version 1607 or later, post a silent toast through
`Windows.UI.Notifications.ToastNotificationManager` and receive the click from
an in-process `INotificationActivationCallback`. This is the same mechanism
[Avalonia.Labs](https://github.com/AvaloniaUI/Avalonia.Labs/tree/main/src/Avalonia.Labs.Notifications/Windows)
uses for unpackaged apps.

The running executable gets one AppUserModelID, derived from its path and
stored under `HKCU\Software\Classes` only while a Platform host owns a
notification callback. The registration is removed with the host, so a
later click does not start the process. The callback posts the caller-owned id
back to Godot's main thread.

Linux remains unimplemented.

## Consequences

- The Godot editor and an exported game have different notification identities
  because each identity follows that process's executable, and the identity is
  hashed from the executable path rather than from the project or the game name.
  Verified on Windows 11 26200 with one example exported to two directories: the
  editor registered `GdKirie.81B13CF14E5646A224E33F5AEAB5C2C2` and displayed as
  `Godot_v4.7.2-stable_mono_win64`, while the debug and release exports registered
  two further ids and both displayed as `KirieBasicPlatform` (the executable file
  name). Renaming or moving the executable changes the identity, and the per-app
  notification setting and notification history stay with the old one.
- Windows does not show a permission prompt. When notifications are turned off,
  `show()` fails. `IToastNotifier::get_Setting` is not a reliable pre-flight
  check on Windows 11: before the identity has ever delivered, the query itself
  fails with `ERROR_NOT_FOUND` (`0x80070490`) rather than reporting a value. The
  implementation therefore delivers first and only rejects a setting that was
  actually reported as something other than `Allowed`.
- The per-user `AppUserModelId` and `CLSID` registrations are created when a
  host first publishes and removed with that host. Verified on Windows 11
  26200: a click is delivered to the live host process through the registered
  class object, and no second process is started.
- One Platform notification host can be active per process. A second host fails
  at attachment instead of replacing the first host's callback.
- Elevated processes are not supported by this Windows API.
- A crash can leave the per-user registration behind until the next successful
  shutdown removes it. A click in that window starts the executable: verified that
  the shell launches it through `LocalServer32` with `-Embedding` from a
  `svchost.exe` parent while no host was running. The activation is not delivered
  at that moment, because the class object is registered only when a process
  publishes its first notification. COM holds the activation until then, so the
  freshly started process received it only after its own first `show()`.
- The implementation calls WinRT by vtable and does not take a dependency on
  the Windows App SDK, the archived toolkit, or MicroCom.

## Sources

- [Avalonia.Labs Windows notifications](https://github.com/AvaloniaUI/Avalonia.Labs/tree/main/src/Avalonia.Labs.Notifications/Windows)
- [ToastNotificationManager](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotificationmanager)
- [INotificationActivationCallback](https://learn.microsoft.com/en-us/windows/win32/api/notificationactivationcallback/nn-notificationactivationcallback-inotificationactivationcallback)
- [RoInitialize](https://learn.microsoft.com/en-us/windows/win32/api/roapi/nf-roapi-roinitialize)
- [CoRegisterClassObject](https://learn.microsoft.com/en-us/windows/win32/api/combaseapi/nf-combaseapi-coregisterclassobject)
- [Application User Model IDs](https://learn.microsoft.com/en-us/windows/win32/shell/appids)
- [WPF app notifications](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-wpf)
