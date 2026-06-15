# CLI test fixtures

These fixtures are copied into temporary Kirie projects during CLI tests. Keep
Kirie config fixtures as real `kirie.config.ts` files instead of building
JavaScript or TypeScript source strings inside test code.

Vite loads config as a module from disk, and its conditional config API passes
values such as `command` and `mode` into an exported config function. File
fixtures exercise that user-facing boundary while inline source strings make
quoting, escaping, imports, and formatting easier to get wrong.

Use inline source only for tiny one-off generated files where file contents are
not the behavior under test.

Reference: [Vite conditional config](https://vite.dev/config/#conditional-config).
