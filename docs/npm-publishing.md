# npm Publishing

This repository publishes browser-side npm packages from GitHub Actions using
npm trusted publishing. The workflow avoids long-lived npm write tokens and
lets npm issue short-lived publish credentials through GitHub Actions OIDC.

## Current Packages

- `@gd-kirie/ipc` is published from `packages/ipc`.

## npm Setup

The npm organization and package scope is `gd-kirie`; the published browser
package is `@gd-kirie/ipc`.

Configure trusted publishing for `@gd-kirie/ipc` on npmjs.com. These fields
identify the GitHub repository that is allowed to publish the package:

- Organization or user: `moeru-ai`
- Repository: `godot-kirie`
- Workflow filename: `npm-publish.yml`
- Environment name: leave empty unless the workflow is later moved behind a
  GitHub deployment environment

The package manifest must keep `repository.url` set to the GitHub repository
URL. npm validates that field during trusted publishing.

## Release Flow

1. Run the release bump from the repository root:

   ```sh
   mise x -- corepack pnpm run release
   ```

   `bumpp` updates package versions recursively, runs a package build and
   `pnpm publish -r --dry-run`, then creates a local release commit and
   `v<version>` tag.

2. Push the release commit and tag.

3. The `Publish npm Packages` workflow runs for pushed `v*` tags, builds
   packages, runs `pnpm publish -r --dry-run`, and publishes public workspace
   packages with `pnpm publish -r`.

Manual `workflow_dispatch` runs build and npm publish dry-run validation only.
Actual publishing is restricted to pushed release tags.

## References

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [GitHub Actions OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)
- [bumpp](https://github.com/antfu-collective/bumpp)
- [pnpm publish behavior](https://pnpm.io/cli/publish)
