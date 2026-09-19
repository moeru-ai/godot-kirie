---
status: "proposed"
date: 2026-09-18
decision-makers: "LemonNeko"
consulted: "Codex"
informed: "Kirie contributors"
---

# Add macOS desktop notifications to the Platform layer

## Context

The WebView needs to show a system notification and receive its ID when the
user clicks it. Godot 4.7 has no desktop notification API.

## Decision

Add `notifications.show()` and `notifications.onActivated()` to the Platform
layer. The application owns the notification ID and decides how activation
affects navigation.

Use [RumpSharp](https://github.com/duplicati/rumpsharp) with its in-process
transport on macOS 11 or later. It provides the UserNotifications binding and
owns the process delegate without starting a helper application. The first
`show()` requests authorization; permission and delivery failures reject that
call.

Activation belongs to the attached `GdKiriePlatformHost`. It is not persisted
across disposal or a cold launch. Actions, icons, badges, scheduling, progress,
and Windows or Linux backends remain out of scope.

## Consequences

- Product routing stays outside the native host.
- Applications must not install another UserNotifications delegate while a
  Platform host is active.
- RumpSharp requests alert, sound, and badge permission, although Kirie posts
  silent notifications without a badge.
- Other desktop platforms require separate backend decisions.

## Sources

- [Apple notification authorization](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)
- [UNUserNotificationCenterDelegate](https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate)
