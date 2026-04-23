# Kirie Godot Plugin

This directory is the Godot-facing side of `Kirie`.

## Files

- `Kirie.gdip`: Godot iOS plugin descriptor
- `Kirie.xcframework`: native build output

## Export flow

1. Build the native plugin:

```sh
./scripts/build_kirie_ios.sh
```

2. In Godot, open the iOS export preset and enable the `Kirie` plugin.
3. Export iOS and run the generated app.

## Scope

This first version follows the same low-level API as Android:
`create_webview`, `destroy_webview`, `load_url`, and `send_ipc_message`.

## Notes

- ATS is currently widened unconditionally through the plugin plist injection.
- Invalid TLS certificates are currently bypassed unconditionally.
- TODO: Narrow ATS and invalid TLS bypass to debug-only before shipping.
