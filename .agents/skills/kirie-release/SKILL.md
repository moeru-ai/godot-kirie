---
name: kirie-release
description: Prepare and publish coordinated Kirie releases across kirie-templates and godot-kirie. Use when a user requests a Kirie version release.
---

# Kirie Release

Release the template first so new projects can reference the target Kirie version.
Then release the main repository with a pin to that template commit.

## Release rules

- Store the target in `KIRIE_RELEASE_VERSION` without a `v` prefix.
- Use a clean checkout for each repository. Stop if a checkout contains unrelated changes.
- Run language and package tools through mise.
- Do not merge a release pull request.
- Do not create a tag before a human merges the pull request.
- Do not replace an existing remote tag.
- Preserve the configured Git signer. Do not disable signing without explicit approval.

## 1. Update the template repository

1. Fetch and fast-forward `moeru-ai/kirie-templates/main` in a clean checkout.
2. If no local checkout exists, clone the repository into a temporary directory.
3. Update the Kirie package versions in `templates/basic/package.json` to `KIRIE_RELEASE_VERSION`.
4. Keep the template project's own version unchanged.
5. Parse the JSON and examine the complete diff.
6. Commit the change with `chore: upgrade basic template to Kirie <VERSION>`.
7. Push the commit to the template repository's `main` branch.
8. Record the full commit SHA as `TEMPLATE_SHA`.

If direct push is not permitted, stop and report the branch-protection result.
Do not create an unrequested workaround.

## 2. Prepare the main release branch

1. Make sure that the `godot-kirie` checkout is clean.
2. Fetch `origin/main`.
3. Create branch `release/v<VERSION>` from `origin/main` and switch to it.
4. Install the frozen dependency state with `mise x -- pnpm install --frozen-lockfile`.
5. Set `KIRIE_TEMPLATES_COMMIT` in `packages/cli/src/init.ts` to `TEMPLATE_SHA`.
6. Run bumpp in recursive mode:

   ```sh
   mise x -- pnpm exec bumpp --release "$KIRIE_RELEASE_VERSION" --recursive --no-commit --no-tag --no-push --yes
   ```

The `--recursive` option updates workspace package manifests.
The `--all` option only changes Git commit behavior and is not a substitute.
The repository's bumpp hook updates the .NET, Godot, and iOS version fields.
The hook also builds the packages and runs the npm publish dry run.

If bumpp stops after file changes, examine the partial state before another run.

## 3. Examine and validate the release diff

1. Run `git diff --check`.
2. Examine `git diff --stat` and the complete `git diff`.
3. Make sure that each release version field contains `KIRIE_RELEASE_VERSION`.
4. Make sure that `KIRIE_TEMPLATES_COMMIT` equals `TEMPLATE_SHA`.
5. Make sure that no generated artifact or unexpected lockfile change exists.
6. Make sure that bumpp created no commit and no tag.
7. Refresh the frozen dependency state with `mise x -- pnpm install --frozen-lockfile`.
8. Run `mise run lint:biome`.
9. Make sure that the publish dry run lists every public package at `KIRIE_RELEASE_VERSION`.

If the dry run reports no new packages, stop.
This result usually means that workspace manifests did not change.

## 4. Create the pull request

1. Commit the examined files with `release: v<VERSION>`.
2. Push branch `release/v<VERSION>` to `origin`.
3. Open a pull request into `main` with title `release: v<VERSION>`.
4. Leave the pull request body empty unless the user requests text.
5. Report the pull request URL.

## 5. Wait for the human merge

Stop after the pull request opens.
Do not merge it and do not create the release tag.

Resume only after GitHub reports the pull request state as `MERGED`.
Record the pull request's full merge commit SHA as `MERGE_SHA`.

## 6. Create and push the release tag

1. Fetch `origin/main` and the remote tags.
2. Make sure that `MERGE_SHA` is reachable from `origin/main`.
3. Read the release files at `MERGE_SHA` and make sure that they contain `KIRIE_RELEASE_VERSION`.
4. Make sure that tag `v<VERSION>` does not exist locally or remotely.
5. If local `main` is available, switch to it and fast-forward it from `origin/main`.
6. If another worktree owns `main`, do not modify that worktree.
7. Create lightweight tag `v<VERSION>` at `MERGE_SHA`.
8. Push only `refs/tags/v<VERSION>` to `origin`.
9. Read the remote tag and make sure that it points to `MERGE_SHA`.

If the tag exists at another commit, stop and report both SHAs.
Never force-update a release tag without explicit approval.

Use the merge commit instead of the branch commit because GitHub can squash the pull request.
See the upstream [bumpp documentation](https://github.com/antfu-collective/bumpp#readme) for recursive monorepo behavior.
