# Framework7 swipe-back prototype

This is a throwaway interaction prototype for one question: can Framework7
detect a gesture that begins at the physical left edge inside Kirie's
full-screen mobile WebView and use it to return to the previous Framework7
route?

The web app uses Vue 3, Framework7 Vue, Vite, and a minimal UnoCSS setup. It
also reports raw touch coordinates and Framework7 `swipeback` progress in a
pointer-transparent overlay, then sends completed or reset gestures to Godot
over Kirie's text lane.

Framework7 implements this in its Core View router, not in Vue or Popover. The
router's iOS defaults enable swipe-back with a 30 CSS-pixel active area, and the
Vue View component forwards the corresponding parameters and events. See the
[research report](../../docs/framework7-edge-swipe-research.md) and the
[upstream recognizer](https://github.com/framework7io/framework7/blob/ec6689fe7644906e3498e7bf9497cdaab9558969/src/core/modules/router/swipe-back.js).

## Run it

Desktop requires the Godot CEF addon. Install it first:

```sh
mise run install:godot-cef examples/framework7-swipe-back
```

Then run a desktop dev session:

```sh
mise x -- corepack pnpm -F @gd-kirie/framework7-swipe-back run dev
```

Build only the web input with:

```sh
mise x -- corepack pnpm -F @gd-kirie/framework7-swipe-back run build
```

For the canonical packaged iOS Simulator flow:

```sh
mise x -- xcrun simctl list devices available
SIMULATOR_ID=<available-iphone-udid> \
  mise run run:example -- ios framework7-swipe-back
```

The iOS runner builds the web app and native Kirie artifacts, exports the Godot
project, boots the selected simulator when needed, installs the application,
and launches it.

## Manual check

1. Tap **Open detail page**. Swipe-back cannot work on the initial route because
   no previous Framework7 page exists yet.
2. On the detail page, drag right from the absolute left bezel. The overlay
   should show `inside 30 px: yes` and then `framework7-moving`.
3. Release after a quick drag longer than 10 px, or after a slow drag beyond
   half of the View width. The app should return to the home page.
4. Repeat from farther than 30 px from the left edge. The raw touch state
   should update, but Framework7 progress should remain at zero.
5. Scroll vertically in the control area. It should scroll without navigating
   back.

Kirie currently leaves WKWebView's native back-forward navigation gestures
disabled, so this test isolates Framework7's JavaScript recognizer. Simulator
touch injection is not part of the current repository tooling; the edge drag is
a manual interaction in the Simulator window.

Framework7 Vue 9.1.1 publishes declaration files that the repository's
TypeScript 6 toolchain cannot parse. The example therefore keeps narrow,
type-only shims under `src-web/src/types` for the Framework7 app and View
surface exercised here; Vite still resolves the real runtime packages. Remove
the shims after upstream declarations compile under this toolchain.

The packaged iOS Simulator flow is the validated target for this experiment.
Android behavior remains unverified and has additional system back-gesture
constraints described in the research report.
