---
status: "proposed"
date: 2026-09-22
decision-makers: "LemonNeko"
consulted: "Doji"
informed: "Kirie contributors"
---

# Export Platform inbound events as Eventa contracts

## Context

`@gd-kirie/platform` exposes host-initiated events. It first wrapped each event in
an `onXxx(listener)` method that kept its own `Set` of listeners and fanned out
from one `context.on(...)` registration.

`@moeru/eventa` already implements that dispatch. `EventContext.on(event,
handler)` stores handlers in its own listener set and returns an unsubscribe
function, so the wrapper added a second registry without adding policy. Eventa's
documented pattern defines each event once, exports it, and subscribes where it
is consumed. The application already owns the Eventa context, so it can subscribe
directly; ADR-0005 already moved `back.onRequested()` to this shape.

## Decision

Export the host-initiated Platform events as `@moeru/eventa` contracts:
`hostWindowStateChanged`, `notificationActivated`, and `backRequested`.
Consumers subscribe with `context.on(contract, handler)` and unsubscribe with the
returned function. `createPlatformClient` keeps the request/response methods and
`globalShortcuts`, which correlates each incoming shortcut event with the handler
registered for that shortcut.

## Consequences

- The package keeps one listener registry instead of two: Eventa's.
- The wire name and payload type of each inbound event become part of the public
  API.
- Consumers handle the Eventa event shape (`{ body }`) instead of a bare payload.
- Removing `hostWindow.onStateChanged` and `notifications.onActivated` is a
  breaking change for consumers on the previous release.

## Sources

- [Eventa README: `context.on` and shared event definitions](https://github.com/moeru-ai/eventa)
- [ADR-0004](0004-add-macos-desktop-notifications.md): added the notification
  subscription this replaces.
- [ADR-0005](0005-add-android-system-back-to-the-platform-layer.md): the Back
  event uses this shape.
