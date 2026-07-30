# Framework7 edge-swipe navigation research

This note records how Framework7 9 implements interactive swipe-back navigation
inside a mobile WebView, and what a Kirie test project needs to reproduce it.

## Source snapshot

The source review used Framework7 `master` at commit
[`ec6689fe7644906e3498e7bf9497cdaab9558969`](https://github.com/framework7io/framework7/commit/ec6689fe7644906e3498e7bf9497cdaab9558969).
All Framework7 source links below are pinned to that commit. The public
documentation identified itself as Framework7 9.1.1 when this note was written.

## Summary

Framework7's swipe-back is a JavaScript router gesture, not a Vue feature and
not a request to a native WebView navigation API. A Framework7 `View` owns a
router and history. The router listens for trusted DOM touch events, accepts a
gesture that starts within a narrow edge region and moves in the back direction,
interactively translates the current and previous page elements, and finally
updates Framework7's own route history.

This works in `WKWebView` because web content receives `touchstart`,
`touchmove`, and `touchend`. Framework7 chooses those events when the runtime
reports touch support, falling back to pointer events otherwise. The Vue
`f7-view` component only exposes the View parameters as Vue props, creates the
core View, and forwards its swipe-back events.

For a Kirie iOS experiment, the important ingredients are therefore:

- initialize Framework7 with the iOS theme;
- render a router-enabled main `f7-view`;
- define at least two page routes and navigate forward before testing back;
- keep `iosSwipeBack` and `preloadPreviousPage` enabled; and
- do not turn on `WKWebView`'s separate native back-forward navigation gesture.

The linked Popover example is not the source of this behavior. Popover is a
temporary overlay. It can contain a nested View, but only that nested View's own
router could then have swipe-back behavior.

## Defaults and configuration surface

Framework7 defines these core View defaults:

| Parameter | Default | Role |
| --- | ---: | --- |
| `router` | `true` | Creates the View router required by swipe-back. |
| `preloadPreviousPage` | `true` | Keeps or reloads the preceding page so it can be shown during the drag. |
| `iosSwipeBack` | `true` | Enables the recognizer under the iOS theme. |
| `iosSwipeBackActiveArea` | `30` | Maximum start distance, in CSS pixels, from the View's left edge in LTR. |
| `iosSwipeBackThreshold` | `0` | Distance subtracted before interactive movement begins. |
| `iosSwipeBackAnimateShadow` | `true` | Animates the current page's shadow. |
| `iosSwipeBackAnimateOpacity` | `true` | Animates the previous page's overlay opacity. |
| `mdSwipeBack` | `false` | Swipe-back is opt-in under the Material theme. |
| `mdSwipeBackActiveArea` | `30` | Material-theme active edge width. |
| `mdSwipeBackThreshold` | `0` | Material-theme movement threshold. |

These values come from the
[View module defaults](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/components/view/view.js#L40-L98).
The [official View documentation](https://framework7.io/docs/view#view-parameters)
describes the active area as the invisible left edge that triggers swipe-back
and says `preloadPreviousPage` should remain enabled for correct swipe-back
operation.

The source is slightly more precise than the documentation: the 30-pixel strip
is relative to the left edge of the **View element**, not unconditionally to the
physical screen. In RTL, the calculation uses the View's right edge instead.
This distinction matters if a Kirie page embeds a narrow or offset View rather
than making the main View fill the WebView.

The Vue component declares the same parameters as `f7-view` props, including
`iosSwipeBack`, `iosSwipeBackActiveArea`, and `iosSwipeBackThreshold`
([Vue View props](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/vue/components/view.vue#L9-L106)).
It removes undefined props and passes the remainder to `f7.views.create`
([Vue View creation](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/vue/components/view.vue#L199-L228)).
It also forwards the core router events as Vue component events
([Vue event wiring](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/vue/components/view.vue#L240-L262)).
The [official Vue View documentation](https://framework7.io/vue/view) confirms
that `f7-view` accepts all core View parameters.

## Recognition algorithm

### Event selection and attachment

Framework7 considers touch supported when `ontouchstart` exists on `window` or
the older `DocumentTouch` test succeeds
([touch support detection](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/shared/get-support.js#L5-L21)).
It then maps start, move, and end to `touchstart`, `touchmove`, and `touchend`,
or to `pointerdown`, `pointermove`, and `pointerup` on a non-touch runtime
([event mapping](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/touch/touch.js#L502-L513)).

The swipe recognizer attaches the start listener to the View element. Move is
received through Framework7's app-wide active listener, whose underlying
document listener is registered with `passive: false`, allowing the recognizer
to call `preventDefault()`. End is received through the passive app event
([router listener attachment](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L307-L324),
[global listener options](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/touch/touch.js#L404-L442)).
All three handlers reject untrusted events. A JavaScript `dispatchEvent()` test
therefore cannot exercise the real gesture path.

### Start and direction tests

At start, Framework7 records `pageX`, `pageY`, and time. It refuses to start
while page changes are locked, another swipe-back is settling, or a Swipeout is
already open. It also ignores starts inside range sliders, calendar-month
content, and active wide master-detail layouts
([start handling](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L28-L52)).

On the first move it classifies the gesture as scrolling and cancels when
vertical displacement exceeds horizontal displacement. In LTR it also cancels
leftward motion; in RTL it cancels rightward motion. Application code or another
component can cancel it with `event.f7PreventSwipeBack` or
`app.preventSwipeBack`
([direction classification](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L53-L67)).

The first move performs the edge and page checks:

- LTR requires `startX - viewLeft <= activeArea`;
- RTL uses the corresponding region at the View's right edge;
- the event target must belong to a current `.page`;
- a `.page-previous` must already exist in the same View;
- `.no-swipeback`, an opened card, and conflicting Swipeout actions cancel it.

The exact checks are in
[`swipe-back.js` lines 68-103](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L68-L103).

### Interactive progress and completion

For LTR, effective movement is:

```text
effectiveDistance = max(currentX - startX - swipeBackThreshold, 0)
progress = clamp(effectiveDistance / viewWidth, 0, 1)
```

RTL reverses the horizontal sign. Framework7 prevents the browser default,
marks swipe-back and panel-swiping as mutually exclusive, translates the
current page by the effective distance, and translates the previous page from
`-viewWidth / 5` toward zero. It emits `swipeback:move` with progress during
this work
([progress and transforms](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L125-L171)).

On release, the route changes when either:

- elapsed time is below 300 ms and effective distance is greater than 10 px; or
- elapsed time is at least 300 ms and effective distance is greater than half
  of the View width.

Otherwise, both pages animate back to their original positions. Because the
configured threshold is subtracted first, a threshold of `T` implies raw travel
greater than `T + 10` for a fast completion, or greater than
`T + viewWidth / 2` for a slow completion. This is a direct inference from the
[release condition](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L173-L218).

After a successful swipe, Framework7 changes the current route to the previous
page, pops its own history, optionally calls browser `History.back()` only when
`browserHistory` is enabled, removes the page that was swiped away, and emits
the before/after change lifecycle events
([route and history update](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L229-L301)).

## Router and DOM requirements

The recognizer is installed only on a real View router and only when the active
theme's option is enabled: `iosSwipeBack` for `theme === 'ios'` or
`mdSwipeBack` for `theme === 'md'`
([router initialization](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/router-class.js#L959-L973)).
`f7-view` has `router: true` by default, and its core View initialization starts
that router
([View initialization](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/components/view/view-class.js#L199-L225)).

Navigating forward keeps the outgoing page as `.page-previous` whenever
`preloadPreviousPage` or swipe-back is enabled
([forward navigation retention](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/navigate.js#L428-L459)).
This is why the gesture cannot work on the initial page: there must be both a
current page under the finger and a previous routed page in the View.

A minimal Vue shape for the Kirie fixture is:

```vue
<f7-app :theme="'ios'" :routes="routes">
  <f7-view
    main
    url="/"
    :ios-swipe-back="true"
    :ios-swipe-back-active-area="30"
    :preload-previous-page="true"
  />
</f7-app>
```

The route table must map `/` and at least one destination to Framework7 page
components. The test should first navigate from `/` to the destination and then
drag rightward from within the leftmost 30 CSS pixels of the View. The upstream
Vue kitchen sink uses the same main-View arrangement and explicitly enables
`iosSwipeBack` when it is not running its browser-history preview
([Vue kitchen-sink app](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/kitchen-sink/vue/src/app.vue#L1-L18)).

## Native WebView interactions

### iOS and Kirie

Apple documents `WKWebView.allowsBackForwardNavigationGestures` as a separate
native behavior: when enabled, horizontal swipes traverse the WebView's native
back-forward list, and its default is `false`
([Apple documentation](https://developer.apple.com/documentation/webkit/wkwebview/allowsbackforwardnavigationgestures)).
Framework7 does not use that property. Its router normally manages SPA pages
inside one loaded document, so WKWebView history and Framework7 View history
are different layers.

Kirie currently creates a `WKWebView`, configures its content, delegate, and
appearance, but does not change `allowsBackForwardNavigationGestures`
([Kirie WebView construction](https://github.com/moeru-ai/godot-kirie/blob/b0047eef0a5296ffede5b0b0437007a3d1a4e1cc/packages/kirie/native/ios/Kirie/Sources/Kirie/KirieManager.swift#L277-L326)).
It therefore inherits Apple's `false` default, which is the appropriate state
for this Framework7 test. Enabling the native gesture would introduce a second
horizontal navigation recognizer with different history semantics and should
not be part of the first fixture.

Framework7 also applies `touch-action: manipulation` on iOS devices and uses
`overscroll-behavior: none` at the document root
([Framework7 app styles](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/components/app/app.less#L10-L65)).
The decisive behavior is still the active `touchmove` handler calling
`preventDefault()` after the gesture passes the edge, direction, and page
checks.

### Android

Framework7 leaves `mdSwipeBack` disabled by default. Even if it is enabled,
Android 10 and later reserve inward swipes from either screen edge for the
system Back gesture. Android's official guidance says an app-specific edge
gesture can conflict and that native Views may selectively reserve regions with
`View.setSystemGestureExclusionRects()`
([Android gesture-navigation guidance](https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav#handle_conflicting_gestures)).
That is a native host concern; setting only `mdSwipeBack` in Vue cannot ensure
that a `WebView` receives edge touches on every Android navigation mode. The
first Kirie validation should therefore target iOS, while an Android version
should separately decide whether to integrate system Back, use predictive-back
APIs, or reserve a narrowly scoped exclusion region.

## Why Popover is not the mechanism

The official Popover documentation defines Popover as temporary content that
remains until an outside tap or explicit dismissal. Its Vue API exposes
open/close state and modal events, not edge-swipe parameters
([Framework7 Vue Popover documentation](https://framework7.io/vue/popover.html)).
The linked example contains ordinary router links inside an `f7-popover`; those
links close the overlay and navigate the surrounding View. It does not create
the swipe recognizer.

Framework7 Core does allow a Popover to contain another View. Its active-View
lookup gives an opened Popover's nested `.view` priority
([active View selection](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/components/view/view.js#L5-L37)).
In that special layout, the nested View can have its own router and swipe-back
history, but the same View router implementation described above still owns the
gesture. A plain Popover remains irrelevant to the Kirie edge-swipe fixture.

## Framework-independent implementation trace

The following is the smallest source-complete contract needed to reproduce the
iOS interaction without Framework7. Source links point to the pinned upstream
snapshot.

1. **Install one recognizer per navigation surface.** Install it only when the
   surface has routing enabled and iOS swipe-back is enabled. Listen for start
   on the surface itself, non-passive move at document scope, and end at
   document scope; detach all three when the surface is destroyed. Framework7
   selects touch events on a touch runtime and pointer events otherwise. See
   `src/core/modules/router/router-class.js:959-973`,
   `src/core/modules/router/swipe-back.js:307-324`, and
   `src/core/modules/touch/touch.js:404-442,502-513`
   ([router installation](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/router-class.js#L959-L973),
   [recognizer wiring](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L307-L324),
   [global touch wiring](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/touch/touch.js#L404-L442)).

2. **Keep two page layers and a navigation lock.** The current page and the
   immediately previous page must both be mounted; forward navigation retains
   the old page for this reason. Track `isTouched`, `isMoved`, whether direction
   has been classified, whether another page transition is allowed, and whether
   this recognizer is settling. Defaults are router enabled, previous-page
   preload enabled, iOS swipe-back enabled, active area 30 CSS px, threshold 0,
   and both visual effects enabled. See
   `src/core/components/view/view.js:40-98`,
   `src/core/modules/router/navigate.js:428-459`, and
   `src/core/modules/router/swipe-back.js:6-26`
   ([View defaults](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/components/view/view.js#L40-L98),
   [page retention](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/navigate.js#L428-L459)).

3. **Gate start before capturing coordinates.** Reject an untrusted event, a
   disabled or already-active recognizer, an open Swipeout, or a locked router.
   Reject targets in range sliders or calendar months and master/detail pages
   at their wide breakpoint. Otherwise reset move/direction state and record
   start `pageX`, `pageY`, and time. See
   `src/core/modules/router/swipe-back.js:28-52`
   ([start gates](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L28-L52)).

4. **Classify and validate on the first move.** Reject untrusted moves or moves
   without a captured start. Classify only once: cancel when vertical travel is
   greater than horizontal travel, or when travel is opposite the back
   direction. Also honor shared cancellation flags. Then reject a conflicting
   Swipeout action, `.no-swipeback`, an opened card, a missing current page, a
   missing previous page, or a start beyond the active edge. The edge is the
   navigation surface's left edge in LTR and right edge in RTL. Select the last
   previous page if more than one is present, create optional shadow/opacity
   layers, and close an open sheet. See
   `src/core/modules/router/swipe-back.js:53-124`
   ([move gates and preparation](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L53-L124)).

5. **Own an accepted move and render progress.** Prevent the browser default
   from the non-passive listener and mark competing panel gestures blocked.
   Compute signed effective distance as
   `max((x - startX - threshold) * direction, 0)`, then clamp progress to
   `distance / surfaceWidth`. Translate the current page by the distance and
   the previous page from one-fifth-width behind toward zero; update optional
   shadow and opacity effects and emit progress together with current/previous
   page references. Framework7 rounds translations only at device pixel ratio
   1. See
   `src/core/modules/router/swipe-back.js:125-171`
   ([progress rendering](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L125-L171)).

6. **Commit or reset on trusted end.** Clear panel arbitration first. If no
   accepted move exists, clear recognizer state. If effective distance is zero,
   clear transforms and effects immediately. Otherwise commit when elapsed time
   is below 300 ms and distance is over 10 px, or when elapsed time is at least
   300 ms and distance exceeds half the surface width. On commit, change the
   page-position classes, make the previous route/page current, and run the
   before-out and before-in callbacks. Then add settling classes, force the iOS
   layout read, clear inline transforms, and lock both the recognizer and
   navigation until transition completion. Emit before-change or before-reset
   accordingly. See
   `src/core/modules/router/swipe-back.js:173-255`
   ([end decision and transition start](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L173-L255)).

7. **Finalize exactly once after animation.** Unlock interaction and remove
   settling classes. On commit, ensure the history will not become empty, pop
   and persist it, optionally call browser `History.back()`, run the after-out
   and after-in callbacks, invoke before-remove, remove the page that was swiped
   away, emit route and after-change events, and conditionally preload the next
   previous page. On reset, emit after-reset only. In both cases remove
   temporary effects. See
   `src/core/modules/router/swipe-back.js:229-304`
   ([route and cleanup finalization](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js#L229-L304)).

8. **Keep framework adapters passive.** Framework7 Vue declares the parameters,
   passes defined props and route arrays into the core View, initializes it on
   mount, forwards five swipe-back events, and unsubscribes on unmount. It does
   not inspect coordinates, own history, or animate pages. A framework-neutral
   port therefore needs a router/layer controller plus this gesture state
   machine; Vue integration can be a thin component or composable wrapper. See
   `src/vue/components/view.vue:9-106,166-173,199-228,240-262,264-340`
   ([Vue parameter forwarding](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/vue/components/view.vue#L9-L106),
   [Vue creation and events](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/vue/components/view.vue#L199-L262),
   [Vue lifecycle wiring](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/vue/components/view.vue#L264-L340)).

In practical terms, the irreducible pieces are trusted touch delivery, a
non-passive move listener, edge and direction arbitration, two simultaneously
mounted pages, progress transforms, a commit/reset threshold, navigation
locking through animation completion, and an application-level history update.
Neither Vue, native WKWebView back-forward gestures, Framework7's Popover, nor
Kirie IPC is required.

## Recommended first validation

Use a full-screen main View and two visibly distinct routed pages. Show the
current `swipeback:move` progress and the final `swipeback:afterchange` or reset
outcome so the simulator recording proves that the Framework7 recognizer,
rather than a simple click or WebView reload, ran. Validate these cases:

1. Navigate from page A to page B, then perform a quick rightward drag beginning
   at `x <= 30`; page A should track the finger and become current.
2. Start the same drag outside the configured active area; it should not move
   the pages.
3. Begin in the active area but move mostly vertically or leftward; it should
   cancel.
4. Apply `no-swipeback` to page B and confirm that the edge gesture is ignored.
5. Increase `iosSwipeBackThreshold` and confirm that visual progress begins only
   after that additional distance.

A real simulator drag is necessary because the source rejects untrusted DOM
events. This test does not require Kirie IPC; it validates ordinary WebView
touch delivery, Framework7 View routing, and CSS transforms entirely within the
loaded Vue application.
