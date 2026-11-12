---
task: X.Y
owned:
  - packages/core/src/example/**
read_only:
  - docs/**
  - pnpm-lock.yaml
checks:
  - pnpm check
  - scripts/heavy pnpm build
---

# Task X.Y: <title>

## Goal

<Two sentences: what changes and why.>

## Context

- <file:line pointers to the code you build on>
- Applies: docs/SPEC.md "<section>", docs/DESIGN_SYSTEM.md "<section>"

## Contract

<Types and function signatures to honour, copied in. Do not change them.>

## Acceptance criteria

- <Observable behaviour 1>
- <Observable behaviour 2>

## Evidence required

- Tests: <which tests to add and what they prove>
- Screenshots (UI tasks): save PNGs to `$HT_RUN_DIR/shots/` at 390×844 and 1280×800, light and dark, with Chinese sample content.

## Out of scope

- <What not to touch or build>

## Rules

- Edit only files matching `owned`. Do not touch `read_only` paths.
- No new dependencies unless listed here: <none>.
- Do not commit; the orchestrator verifies and commits.
- Never delete, skip or weaken an existing test assertion. If one blocks you, report it.
- If a decision is missing or the contract seems wrong, stop and return `status: "blocked"` with `questions` instead of guessing.
- Run every command in `checks` before reporting and record each result.
- Put suggested documentation changes in `docs_notes`; do not edit docs unless they are owned.
- Your final message must be the JSON report required by the output schema.
