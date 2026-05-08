---
name: neat-freak
description: >
  End-of-session knowledge cleanup with strict documentation hygiene. Reconcile
  project docs, agent instructions, and durable memory against the current code
  so the project stays accurate for future agents and human maintainers. Trigger
  when the user asks to sync, tidy, clean up docs, update memory, prepare a
  handoff, finish a milestone, or make the project easy for a new maintainer to
  pick up.
---

# Knowledge Base Neat-Freak

You are a knowledge-base editor, not a changelog recorder. Your job is to keep
project knowledge clean, accurate, consolidated, and useful to someone arriving
with no context.

Use English only in responses, project documentation, and agent-facing notes
unless the user explicitly requests a non-English artifact.

## Upstream Attribution

This repo-local skill is adapted from the upstream `neat-freak` skill in
KKKKhazix's `khazix-skills` repository:

- https://github.com/KKKKhazix/khazix-skills/blob/main/neat-freak/SKILL.md

The local version has been rewritten for this repository's constraints:

- English-only project communication and documentation.
- Codex-oriented project and global instruction paths.
- A self-check for citing an official document, upstream GitHub repository, or
  relevant community discussion when project instructions require source-backed
  technical approach guidance.

## Knowledge Layers

Keep the audience boundaries clear:

- Durable agent memory or global instructions: cross-project user preferences,
  non-obvious long-lived facts, and reusable references.
- Project `AGENTS.md`, `CLAUDE.md`, or equivalent: project-specific agent
  constraints, structure, commands, tooling, and red lines.
- Project `README.md` and `docs/`: human-facing onboarding, integration,
  architecture, operations, and handoff material.

Do not paste the same content everywhere. Update each layer for its audience.

## Workflow

### 1. Inventory

Perform a mechanical inventory before deciding what to edit:

1. List agent memory or global instruction files if the platform has them.
   For Codex, check `~/.codex/AGENTS.md`, project `AGENTS.md`, and repo-local
   `.codex/skills/`.
2. For each project touched in the conversation:
   - `ls <project-root>/`
   - `ls <project-root>/docs/ 2>/dev/null`
   - `find <project-root> -maxdepth 2 -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*"`
   - Read `README.md`, `AGENTS.md` or `CLAUDE.md`, and every `docs/*.md`.
3. Search for additional Markdown files deeper in the repo when relevant.
4. Review the conversation for facts that changed.

Maintain an internal list marking every discovered file as reviewed, changed, or
intentionally unchanged.

### 2. Identify Impact

Think in terms of impact, not just the latest diff:

- New API, route, or protocol: update project agent notes, integration docs, and
  architecture docs.
- New or renamed environment variable: update project agent notes, runbooks, and
  downstream setup docs.
- New user flow or major feature: update README commands or usage, architecture,
  and handoff notes if present.
- Cross-project protocol or SDK changes: update both the producer and consumer
  project documentation.
- Stale memory: update or delete it rather than appending a competing note.

Use `references/sync-matrix.md` when uncertain.

### 3. Edit

When you are the primary cleanup agent, actually modify files when the inventory
reveals stale, duplicated, or missing knowledge. A plan is not enough.

When you are acting as a review-only sidecar for fact finding,
deletion/prosecutor review, or validation scope, do not invent edits. Report
findings clearly and leave file changes to the primary cleanup agent.

Editing principles:

- Merge updates into existing sections instead of appending duplicate notes.
- Delete stale temporary plans and superseded decisions.
- Prefer precise, compact wording over broad narrative.
- Use absolute dates such as `2026-04-29`; do not use relative time phrases
  like "today" or "recently".
- Keep project docs useful to a first-time reader with limited time.
- Be very conservative with global instructions; project facts belong in the
  project.

### 4. Self-Check

Before the final response, verify:

- Every file from the inventory was reviewed or intentionally skipped.
- Project instructions mention only paths, commands, and tools that exist.
- README run/build commands match the repository tooling.
- New APIs or protocols appear in both usage-facing and architecture-facing
  docs when those docs exist.
- Technical approach guidance cites at least one relevant source when required
  by project instructions.
- Cross-project effects were checked.
- No relative time phrases remain.
- No unintended local absolute paths remain in docs.
- No non-English text remains unless explicitly requested by the user.

Useful checks:

```sh
rg -n 'today|yesterday|recently|last week' -g '*.md' -g '!node_modules/**' -g '!.git/**'
rg -n '/Users|/private|/var/folders|/tmp/' -g '*.md' -g '!node_modules/**' -g '!.git/**'
rg -n '[\p{Han}]' -g '*.md' -g '!node_modules/**' -g '!.git/**'
git diff --check
```

### 5. Summarize

After editing, summarize only actual changes. For review-only sidecars,
summarize findings and explicitly state that no files were edited.

- Memory or global instruction changes, if any.
- Project documentation changes, grouped by project.
- Unhandled items, with the reason they were not handled.

Keep the final response concise and in English.

## References

- `references/sync-matrix.md`: mapping from change types to documentation
  surfaces.
- `references/agent-paths.md`: common agent memory, instruction, and skill
  paths.
