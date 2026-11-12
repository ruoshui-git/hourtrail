# Hourtrail progress

Status values: `todo`, `active` (with the run name), `review`, `done` (with the commit), `blocked` (with the reason). Tasks marked ∥ can run in parallel with the task before them. "You" means the orchestrator does it directly. Model routing in the "Who" column is the default; [agents/codex.md](agents/codex.md) says when the shared Codex usage window forces Luna instead of Sol.

## Milestone 0: foundation

| ID   | Task                                                                                                                                                                      | Who                                                                  | Status                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 0.1  | `git init`, workspace scaffold, lint, format, type and test tooling, `scripts/heavy`, the repo documents, private GitHub repo `hourtrail`, CI workflow running the checks | You                                                                  | done                                                                      |
| 0.2  | `scripts/agent/*` and the smoke run                                                                                                                                       | You                                                                  | done                                                                      |
| 0.3  | `tokens.css`, base styles, font, the contrast test                                                                                                                        | You (copy the values from DESIGN_SYSTEM.md exactly)                  | done                                                                      |
| 0.4a | Screenshot tooling (`pnpm shots`), gallery shell, Blaze, TypeTag, Button, IconButton, Timer, fields and choice controls                                                   | Sol high. Load `frontend-design` for your review (DESIGN_SYSTEM.md). | done (63da7e6; one review fix: Field row stretching)                      |
| 0.4b | Overlays and notices: Sheet, ConfirmDialog, Menu, Toast, Banner, EmptyState                                                                                               | Luna high (Sol if the window allows)                                 | done (Haiku; review fix: dialog title style)                              |
| 0.4c | Domain components: RunningPanel, DayRibbon, TrailList, GapRow, WorkItemRow, SyncBadge, TabBar, Sidebar, ReviewItem, StatTile, BarChart, HBarList, DataTable ∥             | Luna high                                                            | done (Haiku)                                                              |
| 0.4d | Statistics components: StatTile, BarChart, HBarList, DataTable ∥                                                                                                          | Luna high                                                            | done (Haiku; review fix: label fit)                                       |
| 0.5  | Worker serving the built shell, manifest, icons; deploy to staging **and production**                                                                                     | You, after the owner runs `pnpm exec wrangler login`                 | done (staging deployed by CI; production deployed and keyed by the owner) |

**Gate 0 (owner):** approve gallery screenshots (phone and desktop, light and dark, Chinese sample content), and install the production shell on the iPhone to confirm it opens standalone with correct safe areas.

Gate 0 status (2026-11-12): automated part passed. Gallery screenshots in all four variants are in `.agent-runs/gate0-shots/` (one image per gallery section plus open overlays). Production shell is live at https://hourtrail.ruoshuim.workers.dev; owner iPhone install check pending (non-blocking).

## Milestone 1: core recording (local only)

| ID   | Task                                                                                                                                                                           | Who                           | Status                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------- |
| 1.1  | `core`: schemas, ids, `time` with DST, overnight and minute-allocation property tests                                                                                          | Sol high                      | active (1.1-core-model, Sol high) |
| 1.2  | `core/applyMutation`; Dexie stores, repository layer and outbox; Start, Stop and Switch transactions; undo; Dexie upgrade test harness (moved from 1.8)                        | Sol high                      | todo                              |
| 1.3  | Activity types settings                                                                                                                                                        | Luna medium ∥                 | todo                              |
| 1.4  | Work items and projects: list, search, edit, pin, archive                                                                                                                      | Luna medium ∥                 | todo                              |
| 1.5  | Home: bare Start, start from a row, running panel, naming, DayRibbon, today's totals                                                                                           | Luna high                     | todo                              |
| 1.6  | Session editor, manual entry, delete with undo, validation and warnings                                                                                                        | Luna high                     | todo                              |
| 1.7  | History: day navigation, TrailList, GapRow to manual entry, midnight slices                                                                                                    | Luna high ∥                   | todo                              |
| 1.8a | App shell (route group, TabBar/Sidebar, toasts, placeholder destinations), built-in service worker with offline shell, update prompt, install hint, storage persistence helper | Luna high (Sol busy with 1.1) | active (1.8a-app-shell)           |
| 1.9  | Backup file download                                                                                                                                                           | Luna medium ∥                 | todo                              |
| 1.10 | E2E for scenarios A, B, C, D and local Unicode; kill-and-reload persistence tests                                                                                              | Luna high                     | todo                              |

**Gate 1:** scenarios A–D pass in Chromium and WebKit; sessions survive reload, tab kill and an app update; owner uses it on the iPhone for real.

## Milestone 2: daily organisation

| ID  | Task                                                                                      | Who                             | Status |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------- | ------ |
| 2.1 | Switch flow polish and the two-running resolver                                           | Luna high                       | todo   |
| 2.2 | `core` split, merge and overlap detection; editor actions                                 | Sol high, then Luna medium      | todo   |
| 2.3 | `core/review`; Daily review screen; Home's review row                                     | Sol high, then Luna high        | todo   |
| 2.4 | Places library: add, edit, radius, merge duplicates, archive                              | Luna medium ∥                   | todo   |
| 2.5 | `core` place matching; capture on Start and Stop; unknown-place prompts; privacy controls | Sol high, then Luna high        | todo   |
| 2.6 | Search and filters; desktop two-pane History                                              | Luna high                       | todo   |
| 2.7 | Desktop layout pass across all screens                                                    | Luna medium, your visual review | todo   |

**Gate 2:** scenario E with mocked geolocation (sure, suggested, ambiguous, unresolved, low accuracy, denied, timed out) and on the real phone; review flows; Start never waits on GPS (test with a geolocation call that never returns).

## Milestone 3: cloud

| ID  | Task                                                                                        | Who                                | Status |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------- | ------ |
| 3.1 | Worker skeleton: Hono, D1 migrations, security headers, error shape                         | Sol high                           | todo   |
| 3.2 | Auth endpoints, lockout, cookies; sign-in, link-device and devices screens; `setup-account` | Sol high, plus `codex exec review` | todo   |
| 3.3 | Sync push and pull with idempotency, concurrency and merge tests                            | Sol high, plus `codex exec review` | todo   |
| 3.4 | Client sync engine, SyncBadge and details, conflict surfacing in review                     | Sol high                           | todo   |
| 3.5 | Restore from a backup file (both modes)                                                     | Luna high                          | todo   |
| 3.6 | `hourtrail-backups` repo, nightly workflow, `setup-backup-key`, `restore-drill`, heartbeat  | Luna medium ∥                      | todo   |
| 3.7 | Erase account, raw-coordinate sync toggle and cloud deletion                                | Luna medium                        | todo   |
| 3.8 | Two-device E2E (two browser contexts against `wrangler dev`): scenarios G, H, I, L          | Luna high                          | todo   |

**Gate 3:** scenarios G, H, I, L; duplicate and replayed batches create nothing twice; an offline edit on each device to the same field produces one winner and one conflict record; unauthenticated and revoked-device requests get 401; restore drill passes from both a backup file and a nightly dump; CPU per request is under the limit. Then the owner runs `setup-account` and `setup-backup-key` for production and approves the production deploy; the phone's existing local data uploads on first sign-in.

## Milestone 4: reporting and reminders

| ID  | Task                                                                                                                                                | Who                      | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------ |
| 4.1 | `core/report` aggregation with tests for type exclusion and totals                                                                                  | Sol high                 | todo   |
| 4.2 | Statistics screen and charts                                                                                                                        | Luna high                | todo   |
| 4.3 | Report builder, presets, printable view                                                                                                             | Luna high                | todo   |
| 4.4 | CSV and XLSX export with the Unicode round-trip test                                                                                                | Luna medium ∥            | todo   |
| 4.5 | Push subscription, cron handler, VAPID send, service worker handlers, reminder settings, "Still working?" sheet                                     | Sol high                 | todo   |
| 4.6 | Polish: accessibility pass (keyboard, VoiceOver labels, contrast), dark mode, empty states, bundle size, copy review against DESIGN_SYSTEM.md Voice | Luna medium, your review | todo   |

**Gate 4:** scenarios F, J, K and a full A–L regression; a real push arrives on the installed iPhone app; a monthly report prints cleanly and opens in Excel with Chinese intact.

## Verification

Commands (define them in the root `package.json`): `pnpm check` (format, lint, types, unit tests), `pnpm build`, `pnpm e2e` (Playwright, Chromium and WebKit iPhone profile, against `wrangler dev` with a fresh local D1), `pnpm shots` (fixed screenshot set: every route at 390×844 and 1280×800, light and dark, with Chinese seed data). CI runs `check`, `build` and `e2e` on every push and deploys `main` to staging.

| Scenario            | Automated proof                                                                                                                      | Owner check on device | Status |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ------ |
| A Quick start       | E2E: tap a recent item, session exists with no form                                                                                  | Gate 1                | todo   |
| B Resume            | E2E with a mocked clock: two sessions, one work item                                                                                 | Gate 1                | todo   |
| C Details later     | E2E: different notes on two sessions, item unchanged                                                                                 |                       | todo   |
| D Historical entry  | E2E: two sessions yesterday appear in History and totals                                                                             |                       | todo   |
| E Place recognition | Unit tests for matching; E2E with mocked geolocation                                                                                 | Gate 2                | todo   |
| F Forgotten session | Worker test for the cron decision; E2E for the sheet and corrected totals                                                            | Gate 4, real push     | todo   |
| G Offline           | E2E: offline start and stop, reload, go online, record on server                                                                     | Gate 3, airplane mode | todo   |
| H Desktop edit      | Two-context E2E: edit on one, appears on the other, no duplicate                                                                     | Gate 3                | todo   |
| I Unicode           | Two-context E2E plus the export round-trip test                                                                                      | Gate 4                | todo   |
| J Monthly report    | Unit tests on `core/report`; E2E for the print view                                                                                  | Gate 4                | todo   |
| K Custom types      | E2E: create, rename, reorder; totals follow `counts_as_work`; Overhead sessions stay out of work hours even when the type is renamed |                       | todo   |
| L Recovery          | E2E: backup, clean profile, restore, deep-compare; `restore-drill`                                                                   | Gate 3                | todo   |

PRD section 18's failure list maps to tests you must see pass: repeated taps (unit, on the transactions), duplicate requests (Worker), app killed mid-session (E2E reload), GPS unavailable or late (E2E), DST and zone change (unit), clock change (unit on the flag), overlapping entries (unit and E2E), update with existing data (Dexie upgrade test), restore (E2E).

## Notes

- Polish list for task 4.6: DataTable period column wraps on phones ("Sep / 14"); a disabled quiet button shows an outline.

- 2026-11-12: Repository bootstrapped. Codex 5-hour window was 38% used at the start (shared with the temple_inventory orchestrator).
- 2026-11-12: Pinned SvelteKit 2.70.4 and TypeScript 6.0.3 (see SPEC "Pinned versions"). Runner smoke test passed, including resume with structured output.
- 2026-11-12: All 72 contrast claims in DESIGN_SYSTEM hold for tokens.css; Stylelint enforces tokens-only styles outside `src/lib/styles/`.
- 2026-11-12: Task 0.4 split into 0.4a/b/c to keep each brief reviewable; the gallery auto-registers section files so 0.4b and 0.4c can run in parallel.
- 2026-11-12: The dataviz palette check flagged Work (lake) vs Overhead (slate) as too close; the owner chose `rose` for Overhead. Charts keep legends, labels, gaps and tables.
- 2026-11-12: Owner granted standing approval for production deploys after a passing gate, and asked to keep building through gates.
- 2026-11-12: Owner decisions: Hourtrail uses its own heavy lock; when Codex is out of quota, tasks go to Claude Haiku subagents.
- 2026-11-12: Playwright WebKit cannot launch on the host without system libraries (`sudo apt-get install libevent-2.1-7t64 libgstreamer-plugins-bad1.0-0 libavif16 gstreamer1.0-libav`); Chromium E2E passes. CI installs them with `--with-deps`.
- 2026-11-12: Owner corrected the Codex instruction: no fast mode by default (`codex-run --fast` to opt in). Task 0.4a was already running in fast mode.
