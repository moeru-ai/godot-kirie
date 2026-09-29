# `@gd-kirie/vitest`

`@gd-kirie/vitest` runs ViDot tests through Kirie's desktop, Android, and iOS
application launchers.

Install it with ViDot and Vitest:

```sh
pnpm add -D @gd-kirie/vitest @vidot/vitest vitest
```

Configure the Vitest pool:

```ts
import { kirie } from "@gd-kirie/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    isolate: false,
    pool: kirie({
      projectPath: import.meta.dirname,
    }),
  },
});
```

The default target is `desktop`. Set `target` to `android` or `ios` for a
mobile run.

Import the test API from `@vidot/vitest` in test files. Add each test-owned
`KirieNode` below `context.root`. ViDot releases that root after each test.
