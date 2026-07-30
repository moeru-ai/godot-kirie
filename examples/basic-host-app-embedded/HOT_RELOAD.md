# Vite live development

The embedded example permanently supports a development URL in debug builds.
`EmbeddedWebBridge` reads the native launch option `kirie-web-url`; when the
option is absent, it loads the packaged
`res://src-web/dist/index.html` page instead.

This keeps development URL selection above Kirie core. Kirie only loads the
selected URL and preserves its text IPC surface.

## Start Vite

For an iOS Simulator or an Android emulator with port forwarding, start Vite on
the Mac loopback interface:

```sh
mise x -- corepack pnpm \
  --dir examples/basic-host-app-embedded/src-web \
  exec vite \
  --host 127.0.0.1 \
  --port 5173 \
  --strictPort
```

For a physical iPhone, use `--host 0.0.0.0` and pass the Mac's reachable LAN
address. `localhost` on the phone refers to the phone itself.

## Launch with the development URL

Pass the option to the exported application:

```text
--kirie-web-url=http://127.0.0.1:5173/
```

The iOS entry accepts both `--key=value` and `--key value` launch forms. For a
physical device, replace the loopback address with the Vite `Network` URL.

Android can keep the loopback URL after forwarding the port:

```sh
adb reverse tcp:5173 tcp:5173
```

The current build/run tasks do not start Vite or pass this option automatically.
They verify the packaged page. A future Kirie development session can own server
lifetime, device routing, and launch arguments above the addon core.

## iOS development transport policy

`export_presets.cfg.in` adds development-only App Transport Security and local
network usage keys. They allow a physical iPhone to reach a LAN HTTP Vite server.
The preset deliberately leaves `kirie/debug/allow_tls_bypass=false`: plain HTTP
needs ATS permission, not invalid-certificate bypass.

This is narrower than the generic setup in
`docs/contents/tutorial/configure-vite-hmr-for-godot-kirie.md`. The generic
Kirie export option currently couples its ATS injection with runtime TLS
challenge bypass, while this specialized prototype writes the ATS keys itself.
Production exports should load packaged resources and omit development network
exceptions.

## Reload lifecycle

Vite injects its client into the existing WebView. CSS updates can apply without
navigating the page; changes without an HMR boundary cause a full page reload.
The native Godot, Kirie, and Eventa objects remain alive, but the browser Eventa
context is recreated. The page therefore emits `web:ready` on every load and
repeats the bidirectional verification exchange.

The path was manually verified on a physical iPhone with Vite 8.0.16: CSS HMR
updated in place, an HTML edit reloaded the page, and Kirie/Eventa communication
resumed after the reload.

## Verification

For CSS HMR, change `src-web/src/style.css` and confirm the card updates without
relaunching the app. For a full reload, change `src-web/index.html` and confirm:

- Vite reports a page reload.
- the WebView displays the new markup.
- native logs show a new `web:ready` and Eventa verification sequence.
- `KIRIE_VIEW_EMBED_EVENTA_PASS` appears again.

The broader lifecycle and export requirements are documented in the repository
tutorial linked above.
