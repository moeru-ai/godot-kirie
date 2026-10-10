# tray

A compact tree editor for the Kirie Tray plugin. Editing labels or
changing the tree rebuilds the native menu. Activating a leaf in the system
tray marks the matching editor row as the last clicked item.

On macOS, the example uses a monochrome template image so the menu bar can
tint it for the current appearance. It uses the regular color icon on other
platforms because they reject `iconAsTemplate: true`.

Rows can be added, deleted, moved within their level, indented below the
previous sibling, or moved out one level. Any row with children becomes a
submenu; leaf rows become clickable native menu items.

Run these setup commands from the repository root:

```sh
mise x -- pnpm install
mise run build:packages
mise x -- pnpm -C examples/tray exec kirie doctor --fix plugin:core
mise x -- pnpm -C examples/tray exec kirie build dotnet
```

Start the Kirie-managed Vite server and Godot project together:

```sh
mise x -- pnpm -C examples/tray run dev
```
