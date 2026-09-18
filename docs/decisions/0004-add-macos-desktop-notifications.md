---
status: "proposed"
date: 2026-09-18
decision-makers: "LemonNeko"
consulted: "Codex"
informed: "Kirie contributors"
---

# Add macOS desktop notifications to the Platform layer

## Context and Problem Statement

A Kirie application can finish background work while its main window is hidden
or unfocused. The WebView needs to show a system notification and route a click
back to the feature that created it. Godot 4.7 has no desktop notification API.

How can Kirie expose this capability without putting product navigation or
a second IPC owner in the native host?

## Decision

Add desktop notifications to `@gd-kirie/platform` and `GdKirie.Platform`. The
browser calls `notifications.show()` with a caller-owned ID, title, and body.
The host emits `notifications.onActivated()` with the same ID after a click.
The application decides what the ID means and which page or window to open.

The initial native backend supports macOS 11 or later. It uses RumpSharp as a
typed .NET interface to Apple's UserNotifications framework. The first
`show()` call requests notification authorization. The backend presents silent
notifications while the application is in the foreground.

RumpSharp requests alert, sound, and badge authorization. Kirie sends silent
notifications and does not set the application badge.

Kirie forces RumpSharp to use its in-process transport. RumpSharp does not
create or start its optional helper application. RumpSharp owns the one
UserNotifications delegate for the process. Applications must not install a
second delegate while the Platform host is active.

Notification activation is a runtime event. It belongs to the attached
`GdKiriePlatformHost`, stops when that host is disposed, and is not persisted
for delivery after a cold app launch. The API does not include actions, icons,
badges, scheduling, progress, or a general permission interface.

Windows and Linux calls fail as unsupported. The Windows App SDK is the current
Microsoft path for notifications in an unpackaged desktop application. It adds
a new runtime and packaging dependency. That dependency needs a separate
decision before Kirie adds a Windows backend.

## Consequences

- Applications can correlate a notification click without sending routing
  policy to the native host.
- Permission refusal and native setup failures are returned to the original
  `show()` call.
- The host owns callback cleanup and does not deliver stale activation events.
- Kirie does not maintain a private Objective-C runtime binding for
  UserNotifications.
- The dependency requests sound and badge authorization although Kirie does
  not use those capabilities.
- macOS is the only supported notification platform in this revision.
- The macOS backend requires macOS 11 or later.
- A terminated application cannot recover the notification ID from a click.
- Windows support requires a later dependency and packaging decision.

## Sources

- [Asking permission to use notifications](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)
- [UNUserNotificationCenterDelegate](https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate)
- [RumpSharp](https://github.com/duplicati/rumpsharp)
- [Windows app notifications overview](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/)
