# Addon Release

GitHub Release addon publishing is planned but not configured yet. This flow is
separate from npm publishing, which is only for browser-side workspace packages
such as `@gd-kirie/ipc`.

## Intended Artifact

The downloadable addon should be produced as a build artifact, not by using
GitHub's source archive directly.

The public zip should unpack to a standard Godot addon layout:

```text
addons/kirie/
```

The public addon should include release native artifacts:

- `addons/kirie/libraries/android/Kirie-release.aar`
- `addons/kirie/ios/Kirie.xcframework`

Development-only debug native artifacts should not be included in the public
addon zip.

## Local Pack Flow

Build native release artifacts and pack the public addon zip:

```sh
mise x -- corepack pnpm run build:addon-pack
```

The task stages a clean addon tree at:

```text
dist/addons/kirie/
```

and writes:

```text
dist/kirie-addon.zip
```

The zip is rooted so it unpacks into `addons/kirie`.

To check an already staged addon tree without rebuilding native artifacts:

```sh
mise x -- corepack pnpm run check:addon-pack
```

## TODO

- Add a GitHub Actions release workflow that builds native artifacts, packs the
  addon zip, and uploads it as a draft GitHub Release asset for pushed `v*`
  tags.

## References

- [GitHub Releases documentation](https://docs.github.com/repositories/releasing-projects-on-github/about-releases)
- [Godot `EditorExportPlugin` documentation](https://docs.godotengine.org/en/stable/classes/class_editorexportplugin.html)
- [`dsh0416/godot-cef` build workflow](https://github.com/dsh0416/godot-cef/blob/main/.github/workflows/build.yml)
