# `@gd-kirie/alint-config`

Alint rules and presets for Kirie repository review experiments.

## Usage

```ts
import gdKirieAlintConfig from "@gd-kirie/alint-config";

export default gdKirieAlintConfig;
```

## Rules

### `@gd-kirie/no-stringified-rethrow`

LLM-backed `onFile` rule that warns when a `catch` block formats the caught
error into a string and throws a new error without preserving the original error
as `cause`.

Examples of incorrect code for this rule:

```ts
try {
  await run();
}
catch (error) {
  throw new Error(`Failed to run: ${error}`);
}
```

Will output a warning like:

```
> alint /Path/to/file.ts

/Path/to/file.ts
  28:0  warning  Caught error is stringified into a new Error message without preserving the original error as cause.  @gd-kirie/no-stringified-rethrow


1 warn / 0 error | 1,598 tokens
```

Examples of correct code for this rule:

```ts
try {
  await run();
}
catch (error) {
  throw new Error("Failed to run.", { cause: error });
}
```

or a project-specific error type that preserves `cause`.

## Planned Rules

The following rules are intentionally documented but not implemented yet:

- `@gd-kirie/no-lossy-record-narrowing`: detect broad `Record<string, unknown>`
  narrowing helpers that erase expected payload or config structure.
- `@gd-kirie/no-polling-wait-loop`: detect in-process readiness waits that use
  sleep-loop polling instead of events, lifecycle hooks, or explicit readiness
  promises.
