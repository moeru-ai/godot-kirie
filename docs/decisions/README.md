# Architecture Decision Records

Architecture Decision Records (ADRs) capture durable architecture decisions,
their context, and their consequences. They complement
`docs/architecture.md`: ADRs explain why a decision was made, while the
architecture document describes the repository's current design.

## Conventions

- Directory: `docs/decisions/`
- Naming: `NNNN-short-title.md`
- Status values: `proposed`, `accepted`, `rejected`, `deprecated`, and
  `superseded`
- Use the Simple template for straightforward decisions and the MADR template
  when comparing substantial alternatives.
- Create a new ADR as `proposed`. Change it to `accepted` or `rejected` after an
  explicit decision-owner review.
- Do not rewrite an accepted decision to describe a replacement. Add a new ADR
  and mark the old one `superseded` with a link.

ADRs are for decisions with lasting architectural or cross-package impact. They
do not replace issues, implementation plans, package READMEs, or current-state
architecture documentation.

## ADRs

- [ADR-0001: Adopt architecture decision records](0001-adopt-architecture-decision-records.md)
  — accepted, 2026-08-24
- [ADR-0002: Add system-wide global shortcuts to the Platform layer](0002-add-system-wide-global-shortcuts.md)
  — superseded by ADR-0003, 2026-08-24
- [ADR-0003: Use a low-level keyboard hook for Windows global shortcuts](0003-use-a-low-level-keyboard-hook-for-windows-global-shortcuts.md)
  — accepted, 2026-08-31
