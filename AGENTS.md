# Hourtrail agent guide

Shared guide for Codex and Claude. Hourtrail is a personal time tracker: an iPhone-first, offline-capable Svelte PWA with cloud sync through one Cloudflare Worker and D1.

## Working rules

- The PRD ([docs/PRD.md](docs/PRD.md)) is the source of truth for behaviour. Do not drop a requirement or add major scope.
- TypeScript strict everywhere. Svelte 5 **runes only** (`$props`, `$state`, `$derived`, `$effect`); `export let` and `$:` fail to compile. SvelteKit 2 as a client-only SPA.
- Format with Prettier (tabs, single quotes, width 100). Conventional Commits with a why-body.
- Keep everything that can be pure in `packages/core`: no browser or Worker APIs there. Both apps import it.
- Add focused tests for every behaviour change. Never delete, skip or weaken an existing assertion to make a check pass; report it instead.
- Do not add dependencies unless the brief lists them. Do not edit files outside the brief's `owned` globs.
- UI: pages compose components from `apps/web/src/lib/components/` and use `--ht-*` tokens only. Do not add tokens, colours, font sizes or shared components; report the need instead.
- English UI only; user content is any Unicode (test with `库存管理系统开发`, `第1寺院`, `修复洗手台`).
- When a decision is missing, stop and report `blocked` with your questions instead of guessing.

## Documentation map

| Document                                           | Holds                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [docs/PRD.md](docs/PRD.md)                         | Product requirements and acceptance scenarios A–L                                                                                   |
| [docs/SPEC.md](docs/SPEC.md)                       | Architecture, data model, time rules, sync, auth, places, reminders, review, reports, backup, PWA, platform limits, pinned versions |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)     | Blaze: tokens, type, space, components, voice, review checklist                                                                     |
| [docs/UI_UX_DECISIONS.md](docs/UI_UX_DECISIONS.md) | Screens and flows, plus a changelog                                                                                                 |
| [docs/PROGRESS.md](docs/PROGRESS.md)               | Task table, gates, scenario matrix                                                                                                  |
| [docs/RUNBOOK.md](docs/RUNBOOK.md)                 | Setup, deploy, keys, backups, restore, recovery                                                                                     |
| [docs/agents/codex.md](docs/agents/codex.md)       | Codex delegation, usage budget, verification loop                                                                                   |

Before a user-facing change, read the relevant UI_UX_DECISIONS section; after it, update it and add one changelog line.

## Repository map

```
apps/web/        SvelteKit SPA: src/routes, src/lib/{features,components,styles}, src/service-worker.ts
apps/worker/     Cloudflare Worker: src/index.ts, routes/, migrations/, wrangler.jsonc (envs: staging, production)
packages/core/   pure domain logic, zod schemas, tests
e2e/             Playwright specs, one file per acceptance scenario
scripts/         heavy, agent/ (codex-run, codex-usage, verify, report schema, brief template)
docs/            see above
```

## Invariants

- **Records**: every synced record has a client UUIDv7 `id`, `rev`, `created_at`, `updated_at`, `deleted_at` (epoch ms UTC). Deletion is a tombstone. Defaults (Work, Overhead, Volunteer, Personal) have fixed ids.
- **Meaning by id, never by name**: reporting reads `counts_as_work` through the type id. A session's `type_id` is copied from its work item at creation and is then independent.
- **Time**: durations are always `end_at − start_at`; elapsed is `now − start_at`, recomputed, never accumulated. Days are bucketed in the synced `reporting_tz`; midnight-crossing sessions are split into slices whose allocated minutes sum exactly. Date/zone arithmetic only in `packages/core/src/time` with `temporal-polyfill`.
- **Local writes**: every change is one Dexie transaction that updates the stores and appends to `outbox`. Start, Stop and Switch are single transactions; GPS and sync run after and can never delay or fail them. The UI reads only from Dexie.
- **Sync**: `core/applyMutation` is the single merge function (server and client). Per-field patches with before/after images; same-field conflicts go to the later edit and the loser is written to a `conflict` record. Batches are idempotent by `batch_id`. Nothing is dropped silently.
- **Security**: no third-party requests of any kind; no secrets in the repo or bundle; every `/api/*` route except enrol/link requires a device session; `/api/*` is never cached.
- **Design**: colour means activity type and nothing else; chrome is ink on paper.

## Validation

Run from the repo root (or the task worktree). Heavy commands go through `scripts/heavy`.

| Check           | Command                                                        | When                  |
| --------------- | -------------------------------------------------------------- | --------------------- |
| Everything fast | `pnpm check` (format, lint incl. Stylelint, types, unit tests) | Every change          |
| Format fix      | `pnpm format`                                                  | Before `pnpm check`   |
| Build           | `scripts/heavy pnpm build`                                     | Web or Worker changes |
| E2E             | `scripts/heavy pnpm e2e`                                       | UI or sync changes    |
| Screenshots     | `scripts/heavy pnpm shots`                                     | UI changes            |

Use `HT_PORT_BASE` for every port so parallel tasks do not collide. Use `pnpm exec wrangler`, never a global `wrangler`.

## Git and deploy

`main` is trunk. Task branches `task/NAME` live in `.worktrees/NAME`. Codex never commits; the orchestrator verifies, commits, rebases and fast-forwards. CI deploys `main` to staging. Production is deployed only by the orchestrator after owner approval.
