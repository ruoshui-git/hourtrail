# Hourtrail v1.0: implementation plan for the orchestrating agent

## 0. Context and how to use this plan

Hourtrail is a personal time tracker: an iPhone-first, offline-capable PWA with cloud sync to a desktop browser, hosted on Cloudflare's free tier. It replaces a manually kept Notion work log. The product requirements (PRD v1.0, 22 sections, acceptance scenarios A–L) were supplied by the owner and are the source of truth for behaviour; this plan resolves the architecture, data model, sync, security, design system and delivery process on top of them.

You are the orchestrator (expected: Claude Opus 5.5 in Claude Code). You write briefs, delegate implementation to Codex agents, verify their work independently, commit, deploy to staging and report at gates. You do not write most of the code yourself. The owner is one person who uses the app in English with Chinese content, on an iPhone and a Windows/WSL desktop.

The repository at `/home/ruoshui/code/hourtrail` holds only `docs/PRD.md` and this plan, and is not yet a git repository. Your first job (Milestone 0) is to initialise it and to split this plan into the repo documents listed in section 3.

Rules that hold throughout:

- Do not drop a PRD requirement or add major scope. If something here conflicts with the PRD, the PRD wins unless section 1 records an owner decision.
- Platform facts in section 14 were checked on 2026-11-12. Re-check anything marked "verify" before relying on it.
- Ask the owner before any production deploy, anything public, or any destructive action on cloud data.

## 1. Decisions already made with the owner

| Topic | Decision |
|---|---|
| Sign-in | One long random **account key**, entered once per device. Each device then holds its own revocable long-lived session. A signed-in device can link another by QR code. No passwords, no email, no third-party identity. |
| Address | Free `workers.dev` addresses: `hourtrail.<account>.workers.dev` (production) and `hourtrail-staging.<account>.workers.dev`. An installed iPhone app is tied to its origin, so the production origin must exist from Milestone 1 and never change. |
| Independent backup | Nightly encrypted database dump committed to a private GitHub repo, plus the in-app backup file. |
| Backup encryption | Dumps are encrypted with `age`; the owner keeps the private key in their password manager. |
| GitHub | You may create two **private** repos under `ruoshui-git` (`hourtrail`, `hourtrail-backups`), push, and configure Actions without asking again. |
| Raw GPS | Raw coordinates stay on the capturing device by default. Named places and each session's assigned place always sync. A Settings toggle turns raw-coordinate sync on. |
| Bare Start | Home has a Start button that begins an untitled session at once; the work item is named later. Daily review lists sessions still untitled. |
| Visual direction | "Blaze" (section 12). |
| Framework | Svelte 5, at the owner's preference. Vue offered nothing this app needs that Svelte lacks. |
| Default activity types | Four: Work, **Overhead** (work-related time such as meetings that does not count toward work hours), Volunteer, Personal. |
| Implementation agents | Codex via `codex exec`: `gpt-6-luna` by default, `gpt-6.1-sol` for the hard parts. Do not use `gpt-6-astra`. When Codex keeps failing, implement it yourself or use a Claude subagent (Sonnet or Opus). |
| Parallelism | Several Codex tasks at once is fine (five have run together on this machine); use your discretion (section 15). |

## 2. Architecture

One Cloudflare Worker serves the built PWA as static assets and an API under `/api/*`, backed by one D1 database. All reading, editing, review and reporting run in the browser against a full local replica in IndexedDB; the server is a sync authority, an auth gate and a reminder sender. Nothing else is hosted.

| Layer | Choice | Why |
|---|---|---|
| Workspace | pnpm workspace, TypeScript strict, Node 26 on the WSL host | Host `node`/`pnpm` at `~/.local/bin` are native Linux. The global `wrangler` on PATH is a Windows binary and fails; always use `pnpm exec wrangler`. |
| Web app | Svelte 5 in runes mode + SvelteKit as a pure client-side SPA (`adapter-static` with `fallback: "index.html"`, `ssr = false` and `prerender = false` in the root layout) + Vite | The owner prefers Svelte; it also gives a smaller offline shell and less boilerplate. SvelteKit is the supported routing path and the one coding agents know best. Set `compilerOptions.runes = true` so Svelte 4 syntax (`export let`, `$:`) is a compile error, since weaker models mix the two. Vite 7.3, Vitest 5 and Playwright 1.63 are known to work on this machine. Pin current stable at bootstrap and record the versions. |
| Service worker | `@vite-pwa/sveltekit` with `injectManifest` (verify it supports the pinned SvelteKit; otherwise use SvelteKit's built-in `src/service-worker.ts` with its `$service-worker` file list) | Precaching with revisioning, plus our own push handlers. |
| Local data | Dexie 4 over IndexedDB | Reliable on Safari, transactional, has live queries. Wrap `liveQuery` once in `apps/web/src/lib/live.svelte.ts` and use only that helper in components. |
| UI primitives | Bits UI v2 (headless Svelte 5 dialog, popover, menu, combobox, switch, tabs) styled only with the tokens in section 12; Lucide's Svelte icon package (verify the current package name) | Accessibility without a visual framework. No Tailwind, no component kit. |
| Dates | `temporal-polyfill`, used only inside `packages/core/src/time` | Correct IANA zone and DST arithmetic on every browser. |
| Spreadsheet | `write-excel-file`, lazy-loaded | Small, browser-side, typed cells. |
| API | Hono + zod on Workers, Workers Static Assets with SPA fallback and `run_worker_first` for `/api/*` | One origin, so cookies and service-worker scope stay simple. |
| Database | D1 (SQLite) | Named in the PRD, has `wrangler d1 export` for the nightly dump. |
| Scheduled work | One Cron Trigger, every 5 minutes | Forgotten-session reminders. |
| Tests | Vitest (unit; `fake-indexeddb` for the repository layer; `@testing-library/svelte` for components), `svelte-check` for types, `@cloudflare/vitest-pool-workers` for the Worker against local D1 (verify it supports the pinned Vitest; otherwise run plain Vitest against `wrangler dev`), Playwright with Chromium and a WebKit iPhone profile | Browsers `chromium-1254` and `webkit-2388` are already in `~/.cache/ms-playwright`; match the Playwright version or run `playwright install`. |

Shared logic lives in `packages/core` as pure functions with no browser or Worker APIs: schemas, ids, time, mutation apply and merge, review rules, report aggregation, place matching, backup format, CSV. Both the web app and the Worker import it. Keep everything that can be pure in there; it is where correctness is tested.

### Repository layout

```
apps/web/            SvelteKit SPA (src/routes, src/lib/features, src/lib/components, src/lib/styles, src/service-worker.ts)
apps/worker/         Worker: src/index.ts, routes/, migrations/, wrangler.jsonc (envs: staging, production)
packages/core/       pure domain logic + zod schemas + tests
e2e/                 Playwright specs, one file per acceptance scenario
scripts/agent/       codex-run, verify, report.schema.json, brief-template.md
scripts/             heavy, setup-account, setup-backup-key, restore-drill
docs/                PRD.md, SPEC.md, DESIGN_SYSTEM.md, UI_UX_DECISIONS.md, PROGRESS.md, RUNBOOK.md, agents/codex.md
AGENTS.md  CLAUDE.md
```

### Environments

- **Local**: `wrangler dev` serving the built app with a local D1. All automated tests run here.
- **Staging**: auto-deployed from `main` by GitHub Actions. You hold a staging account key and use it for tests.
- **Production**: deployed only by you, by hand, after owner approval at a gate. From its first deploy every IndexedDB schema change ships with an upgrade function and a fixture test, because the owner's real data is on it.

## 3. Documents to create from this plan (Milestone 0)

| File | Content | Source |
|---|---|---|
| `docs/PRD.md` | The PRD, verbatim | Already in the repo |
| `docs/SPEC.md` | Sections 2, 4–11, 14 | This plan |
| `docs/DESIGN_SYSTEM.md` | Section 12 | This plan |
| `docs/UI_UX_DECISIONS.md` | Section 13, then a changelog you extend | This plan |
| `docs/agents/codex.md` | Section 15 | This plan |
| `docs/PROGRESS.md` | Task table from section 16 with status, plus the scenario matrix from section 17 | This plan |
| `docs/RUNBOOK.md` | Setup, deploy, key handling, restore procedures, lost-device recovery | Sections 7, 10, 18 |
| `AGENTS.md` | Short shared guide for Codex and Claude: working rules, repo map, invariants (section 4–6 headlines), validation commands, pointers to the docs above | Model it on `temple_inventory/AGENTS.md` |
| `CLAUDE.md` | `@AGENTS.md` plus the delegation summary | Model it on `temple_inventory/CLAUDE.md` |

Codex reads `AGENTS.md` automatically, so conventions go there and briefs stay short. Once the split is done and committed, delete `docs/IMPLEMENTATION_PLAN.md` so there is one source for each topic; git history keeps it.

## 4. Data model

Every synced record has `id` (UUIDv7, generated on the client), `rev` (server sequence number at its last write), `created_at`, `updated_at`, `deleted_at` (all epoch milliseconds, UTC). Deletion is always a tombstone; the data stays in the record so it can be restored.

| Entity | Fields beyond the common ones | Notes |
|---|---|---|
| `activity_type` | `name`, `color` (one of the ten blaze keys in section 12), `sort_key` (number), `counts_as_work` (bool), `remind` (bool), `archived_at` | Four defaults are seeded with fixed ids so two offline devices cannot seed duplicates, in this order: Work (`lake`, counts as work), Overhead (`slate`, does not count; for meetings and other work-related time outside counted hours), Volunteer (`saffron`), Personal (`fern`). New work items default to Work. Reporting reads `counts_as_work` through the id, never the name. |
| `project` | `name`, `archived_at` | The PRD's optional "category or project grouping", one level. |
| `work_item` | `name`, `description`, `type_id`, `project_id?`, `place_id?`, `pinned_at?`, `pin_sort`, `archived_at` | Changing `type_id` never touches existing sessions. |
| `session` | `work_item_id?`, `type_id`, `start_at`, `end_at?`, `start_tz`, `end_tz?` (IANA zone of the device at capture), `note`, `source` (`live`/`manual`), `place_id?`, `place_state`, `place_candidates[]`, `origin_device_id`, `flags` (`clock_suspect`) | `end_at = null` means running. `work_item_id = null` means untitled. `type_id` is copied from the work item at creation and is then independent. |
| `place` | `name`, `lat`, `lng`, `radius_m` (default 100, range 25–2000), `description`, `archived_at` | Coordinates of named places always sync. |
| `session_fix` | `session_id`, `kind` (`start`/`end`), `lat`, `lng`, `accuracy_m`, `captured_at`; id is `<session_id>:<kind>` | Raw GPS. Stays in a local-only store unless the `sync_raw_gps` setting is on. |
| `review_mark` | `day`, `issue_key`, `state` (`reviewed`/`dismissed`); id is `<day>|<issue_key>` | Deterministic id, so two devices marking the same issue converge. |
| `day_review` | `finished_at`; id is the day `YYYY-MM-DD` | |
| `setting` | `value` (JSON); id is the key | Synced keys: `reporting_tz`, `week_start`, `reminder {enabled, threshold_min=240, repeat_min}`, `sync_raw_gps=false`, `long_gap_min=60`, `long_session_min=600`, `note_prompt` (`work`/`all`/`none`), `duration_format`. |
| `report_preset` | `name`, `config` (JSON, section 9) | |
| `conflict` | `entity`, `record_id`, `field`, `kept_value`, `other_value`, `kept_device`, `other_device`, `at`, `resolved_at` | Written by the server during merge, synced down, resolved by the client. |

Deleting is allowed only for sessions and for types, projects, work items and places that nothing references; otherwise the UI offers Archive. Merging two places reassigns sessions to the target, then archives the source.

**Client stores (Dexie)**: one store per entity above, plus `outbox` (pending mutation batches), `local_fix` (raw GPS when not synced) and `local` (device id and name, theme, sync cursor, clock offset, last backup time, push state, location capture on/off for this device).

**D1 tables**: a single generic `records(entity, id, rev, updated_at, deleted_at, data TEXT)` with primary key `(entity, id)` and an index on `rev`; `data` is the record as UTF-8 JSON, validated per entity with the shared zod schemas. One table means one sync code path and no server migration when a client field is added. Server-only tables: `sync_batches(seq PRIMARY KEY, batch_id UNIQUE, device_id, received_at)`, `devices`, `link_codes`, `push_subscriptions`, `reminder_state`, `meta`.

## 5. Time rules

- Timestamps are UTC epoch milliseconds. Durations are always `end_at − start_at`; a running session's elapsed time is `now − start_at`, recomputed on every tick and on `visibilitychange`/`pageshow`. No counter is ever accumulated.
- Calendar days are computed in one synced **reporting time zone** (`reporting_tz`, set from the device on first run). Every instant belongs to exactly one day, so a day's totals cannot double-count. `core/time` exposes `dayOf(instant, tz)`, `dayBounds(day, tz)` (23 or 25 hours on DST days), `splitByDay(session, tz)`.
- A session crossing midnight appears on both days as slices. Minutes are allocated so that slices sum exactly to the session and rows sum exactly to totals: session minutes are `round(ms / 60000)`; earlier slices are floored and the last slice takes the remainder. Reports and exports use these allocated minutes everywhere. Cover this with property tests.
- When the device's zone differs from `reporting_tz`, show a quiet banner in History and Reports ("Days are shown in America/New_York. Switch to Asia/Tokyo?"). Switching re-buckets everything deterministically. Each session also keeps the zone it was captured in.
- Manual entry uses native `datetime-local` inputs at minute precision, interpreted in `reporting_tz`. Nonexistent local times (spring forward) are rejected with a message; ambiguous ones (fall back) take the earlier instant and say so.
- Device clock: each sync response carries server time; the client stores the offset. If it exceeds 2 minutes, Home shows a caution and sessions started or stopped meanwhile get `flags.clock_suspect`. While the app is open, compare `performance.now()` and `Date.now()` deltas; a jump over 2 minutes during a running session sets the same flag. Never auto-correct recorded times.

## 6. Local writes and sync

### Local write path

Every change is one Dexie read-write transaction that updates the entity stores **and** appends the mutation to `outbox`. The UI reads only from Dexie. Start, Stop and Switch are single transactions:

- **Start** checks inside the transaction that no session is running, creates the session with `start_at = now`, and returns. GPS capture and sync are fired afterwards and can never delay or fail the start.
- **Stop** patches `end_at` from `null` to `now`.
- **Switch** ends the running session and creates the next with the same `now`, so there is no gap or overlap.
- Buttons are disabled until the transaction settles, and the in-transaction checks make a double tap harmless.

Undo is an inverse mutation offered in a toast for start, stop, switch, delete, split and merge. Deleted sessions stay restorable under Settings.

### Mutations

```
batch    = { batch_id, device_id, mode?: "restore", mutations[≤50] }
mutation = { id, entity, record_id, kind: "put" | "patch" | "delete" | "undelete",
             value?,                     // put: the whole record
             fields?: { name: { from, to } },   // patch: before and after image per field
             at }                        // client edit time, ms
```

`core/applyMutation(current, mutation, ctx) → { next, conflicts[] }` is the single merge function, used by the server (authoritative) and by the client (optimistic apply and rebase). Rules:

1. **patch**, per field: if the stored value equals `from`, set `to`. If it already equals `to`, do nothing. Otherwise two devices changed the same field: the edit with the later `at` wins (compare `mutation.at` with the record's `updated_at`), and the losing value is written to a `conflict` record. Nothing is dropped silently.
2. **delete** sets `deleted_at`. A **patch** arriving for a deleted record is applied and undeletes it, with a conflict record noting the restoration.
3. **put** on an existing id is treated as a patch of the differing fields, except in a `mode: "restore"` batch, where it overwrites.
4. The server clamps `at` to at most five minutes ahead of its own clock.

### Server

`POST /api/sync/push`: read `max(seq)` and whether `batch_id` was already applied (if so, return the stored acknowledgement); read the affected records in one query; compute in JS with `applyMutation`; write everything in one `db.batch()` whose first statement inserts `sync_batches(seq = max + 1, batch_id, …)`. A concurrent push makes that insert violate the primary key, the whole batch rolls back, and the handler retries from the read (up to three times). The primary key gives serial ordering; the unique `batch_id` gives idempotency. Keep each request to at most four D1 calls (the free plan allows 50 subrequests and 10 ms CPU).

`GET /api/sync/pull?since=<seq>&limit=500` returns records with `rev > since` in order, including tombstones and conflicts, with `more` and `next_since`.

### Client engine

- Triggers: one second after a local write, on `online`, when the app becomes visible, at launch, every 60 seconds while visible, and "Sync now". iOS has no Background Sync, so there is no background trigger.
- Order: push outbox batches oldest first (the `batch_id` is persisted before sending, so a retry is the same batch), then pull until `more` is false. Back off exponentially to five minutes on failure.
- Applying a pulled record: if the outbox holds no mutation for it, replace the local copy; otherwise replay the pending mutations over the pulled copy.
- A 401 puts the app in "signed out" state: recording continues locally and a banner asks to sign in again.
- An empty local database with a valid device session triggers a full pull. That is the lost-or-replaced-device recovery path.

### What the user sees

| State | Label | When |
|---|---|---|
| local only | "On this device only" | Never signed in |
| synced | "Backed up" | Outbox empty, last pull succeeded |
| pending | "3 changes waiting" | Outbox not empty |
| offline | "Offline. 3 changes waiting" | No connection |
| error | "Sync problem" | Opens details and a retry |

Rows with unsent changes carry a small hollow dot, which is how "saved locally" stays distinct from "backed up".

### Cross-device cases

- Two running sessions after a sync (both devices started offline): keep both; Home shows "Two sessions are running" with one-tap resolutions (stop the earlier one when the later began; stop one now; keep both).
- Both devices stop the same session: rule 1 applies to `end_at`; the conflict appears in Daily review with "Use 7:00 AM instead".

## 7. Authentication and security

- `scripts/setup-account --env <staging|production>` generates the account key (160 random bits, shown once as `HT1-XXXXX-…` in Crockford base32), stores its SHA-256 as the Worker secret `ACCOUNT_KEY_HASH`, and generates the VAPID key pair. A high-entropy key needs no slow hash, which is what makes this fit in 10 ms CPU. **You run it for staging. The owner runs it for production in their own terminal, so the production key never enters an agent transcript.**
- `POST /api/auth/enroll {account_key, device_name}`: constant-time compare of the hash; creates a `devices` row and sets the cookie `__Host-ht = <device_id>.<256-bit token>` (HttpOnly, Secure, SameSite=Strict, Path=/, Max-Age 400 days, re-issued when older than 30 days). Only the token's SHA-256 is stored.
- Device linking: `POST /api/auth/link/start` (signed in) returns a one-time code valid five minutes, shown as a QR code and a link; `POST /api/auth/link/finish {code, device_name}` enrols the new device.
- `GET /api/auth/devices`, `DELETE /api/auth/devices/:id`, `POST /api/auth/signout`. Settings lists devices with last-seen time and a Revoke action.
- Failed enrol and link attempts are counted in D1: five failures lock both endpoints for 15 minutes, doubling up to 24 hours. A global lock is acceptable for a single-user app.
- Every other `/api/*` route requires a valid, unrevoked device session. State-changing requests must also carry the app's own `Origin` and `Content-Type: application/json`.
- Headers on every response: a strict CSP (`default-src 'self'`, no inline script, `connect-src 'self'`, `frame-ancestors 'none'`), HSTS, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. `/api/*` responses are `Cache-Control: no-store` and the service worker never caches them.
- No third-party requests of any kind: fonts and icons are bundled, there are no map tiles, analytics or CDNs. A place shows its name, coordinates and accuracy; "Open in Maps" is a link the user taps.
- `POST /api/account/erase` (signed in, account key re-entered) deletes all cloud records; the app offers to wipe the device as well. Export is the backup file (section 10).
- Secrets live only in Wrangler secrets and GitHub Actions secrets. Nothing secret goes in the repo or the frontend bundle. Codex runs get a scrubbed environment (section 15).

## 8. Places, reminders, review

### Place capture and recognition

Capture happens only on Start and Stop, in the foreground, after the session is already saved: `watchPosition` with high accuracy for up to 20 seconds, taking the first fix with accuracy ≤ 50 m or the best one at timeout, then patching the session through the normal mutation path. If the app closes first, `place_state` stays `pending`; on next launch a `pending` older than two minutes becomes `unresolved` without coordinates. The current position is never assigned to a manual or past session.

With `d` the distance from the fix to a place's centre and `a` the fix's reported accuracy:

- A fix with `a > 150 m` is not matched: `unresolved`, reason "low accuracy".
- A place is **possible** if `d ≤ radius + a`, and **sure** if `d ≤ radius` and `a ≤ max(radius, 50)`.
- Exactly one possible place and it is sure: assign it (`set`).
- Exactly one possible place, not sure: `suggested`; show "Near 第1寺院?" with one-tap confirm.
- Two or more possible: `ambiguous`; offer the candidates nearest first.
- None: `unresolved`; a non-blocking prompt offers Name this place, Choose a place, Leave unnamed (`dismissed`, no review issue) or Later (stays in Daily review).

Wording never claims more than the data supports: "Near 第1寺院 (±35 m)". Privacy controls: capture on/off per device, remove coordinates from a session, `sync_raw_gps`, and "Delete raw coordinates from the cloud" when that toggle is turned off. With raw sync off, an unrecognised place can only be named on the device that captured it; say so in the Settings text.

### Reminders

The cron handler, every five minutes, reads running sessions, the reminder setting and the types in one query; for each session past `threshold_min` whose type has `remind` and which is due according to `reminder_state` (once, or every `repeat_min`), it sends a Web Push to every subscription and records the send. A 404 or 410 from the push service removes that subscription.

- Payload: Declarative Web Push JSON (`"web_push": 8030` as an integer, plus `notification` with `title`, `body`, `navigate`), encrypted `aes128gcm` with VAPID. Browsers without declarative support fall back to the service worker's `push` handler, which shows the same notification. Use a WebCrypto-based library that runs on Workers (`web-push-neo`, `@pushforge/builder` or `@block65/webcrypto-web-push`; verify which is maintained) or about a hundred lines of WebCrypto.
- Tapping opens `/?check=<session_id>`: a "Still working?" sheet with Keep running, Stop now, and Stop at an earlier time. A reminder never ends a session.
- Whenever the app opens with a session running past the threshold, the same sheet appears once. That is the fallback when push is unavailable.
- Permission is requested only from a button in Settings. Limits to state in the UI: iPhone push works only for the Home Screen app, the session must have synced for the server to know about it, and delivery is best effort.

### Daily review

`core/review(day, data) → issues[]`, each with a deterministic `issue_key`:

| Key | Condition | Wording is neutral, for example |
|---|---|---|
| `running-long:<id>` | Running longer than `long_session_min` | "Running for 11h 20m" |
| `two-running` | More than one running session | |
| `untitled:<id>` | No work item | "Untitled session, 9:00–10:15 AM" |
| `no-note:<id>` | No note, session ≥ 15 min, type covered by `note_prompt` | "No note" |
| `place:<id>` | `place_state` is `unresolved`, `ambiguous` or `suggested` | "Place not recognised" |
| `overlap:<idA>:<idB>` | Two sessions overlap | "Overlaps Building Maintenance by 20m" |
| `suspect-time:<id>` | Longer than 16 h, starts in the future, `clock_suspect`, or end before start | |
| `gap:<day>:<start>` | Gap of at least `long_gap_min` between the day's first and last session | "1h 30m not recorded, 11:30 AM–1:00 PM" |
| `conflict:<id>` | Unresolved sync conflict | "End time was set on two devices" |

Each issue offers the fix in place plus Mark reviewed and Dismiss (stored as `review_mark`). "Finish review" stores a `day_review` whether or not issues remain. Home shows one quiet row ("Yesterday: 3 things to check") and never a modal.

### Session tools

- **Split** at a chosen time inside the session: the second half is a new session with the same work item, type and place; the note stays on the first.
- **Merge** two sessions with the same work item and type: the result spans earliest start to latest end, notes are joined with a line break, and a confirmation shows the resulting span when there is a gap between them.
- Saving an overlap or a long duration warns but is allowed; end before start is blocked.

## 9. Statistics, reports, exports

Everything is computed in the browser from the local replica by `core/report(config, data)`; no AI and no server work.

- **Statistics**: range (Day, Week, Month, Custom); totals per type; primary work hours (sessions whose type has `counts_as_work`); hours by work item, project and place; session count; a stacked bar per day (per week for ranges over eight weeks); recent activity.
- **Report config**: `title`, `range`, `type_ids`, `group_by` (`work_item`/`project`/`day`/`type`), `show_sessions`, `show_notes`, `excluded_session_ids`, `headings` (custom labels in any language), `hours_format`. Saved as `report_preset`. System headings default to English.
- **Printable view**: a print stylesheet for A4 and Letter, repeated table headers, work-hours total stated separately from other types, session notes under each work item when enabled.
- **CSV**: UTF-8 with BOM, CRLF, RFC 4180 quoting, one row per session: Date, Start, End, Duration (h:mm), Hours (decimal), Type, Counts as work, Project, Work item, Note, Place. Text is exported unmodified.
- **XLSX**: sheets Summary and Sessions, text in string-typed cells, durations as numbers.
- A round-trip test exports `库存管理系统开发`, `第1寺院`, `修复洗手台`, emoji and mixed punctuation and compares bytes after re-parsing both formats.

## 10. Backup, restore, recovery

1. **Backup file** (in Milestone 1, because real data lives on the phone from then): Settings → Backup → Download backup writes `hourtrail-backup-YYYY-MM-DD.json` (`format`, `version: 1`, `exported_at`, counts, every entity including tombstones, and local raw fixes flagged as such). On iPhone use `navigator.share({ files })` when available, since downloads inside a standalone app are awkward. The app nudges when the last backup file is over 30 days old.
2. **Restore** (Milestone 3): pick a file, validate version and schema, show counts and date range, then choose "Add what's missing" (only ids not present) or "Replace everything" (typed confirmation; a backup of the current state is saved first). Restore writes locally and queues `put` mutations in `mode: "restore"` batches, so it works on a clean install before or after sign-in and keeps every relationship because ids are preserved.
3. **Nightly dump**: a scheduled workflow in the private `hourtrail-backups` repo runs `wrangler d1 export <prod db> --remote`, encrypts with `age -r <recipient>`, commits `dumps/YYYY/hourtrail-YYYY-MM-DD.sql.age`, prunes to 60 dailies plus the first of each month, and always updates `last-run.txt` (scheduled workflows are disabled after 60 days without repo activity). It then calls `POST /api/backup/heartbeat` with a shared secret so Settings can show "Last nightly backup". Its Cloudflare token is scoped to D1 read/export only. A failed run emails the owner through GitHub.
4. `scripts/setup-backup-key` (owner runs it) creates the `age` key pair, prints the private key once for the password manager and sets the recipient as a repo variable. `scripts/restore-drill` decrypts a dump, loads it into a fresh local D1 and compares record counts per entity.
5. D1 Time Travel is a third line of defence; verify the free-plan retention and document it in the runbook.

The runbook must cover: restore from a backup file; restore from a nightly dump; replace or lose a phone (sign in with the account key, full pull); lose the account key (rotate with `setup-account`, re-link devices).

## 11. PWA behaviour

- Manifest: name and short name "Hourtrail", `id` and `start_url` `/`, `display: standalone`, icons 192, 512, maskable, and a 180 px apple-touch-icon. `viewport-fit=cover` with safe-area insets.
- Service worker (`injectManifest`): precache the app shell and the font, fall back to `index.html` for navigations, never touch `/api/*`, handle `push` and `notificationclick`.
- Updates: `registerType: "prompt"`. A toast offers "Update ready. Reload"; otherwise the update applies on the next cold start. An update never clears IndexedDB. Dexie versions carry upgrade functions, each with a test that upgrades a fixture of the previous version.
- Ask for `navigator.storage.persist()` after the first recorded session. Storage can still be evicted, which is why sync state, the backup nudge and the full-pull recovery exist.
- In iPhone Safari outside standalone mode, show an "Add to Home Screen" sheet with the two steps.
- Degrade without failing: no geolocation hides place capture with a note; no push leaves in-app reminders; no persistence shows a one-line caution in Settings.
- iPhone specifics to respect: timers freeze in the background (always recompute from timestamps); inputs must be at least 16 px to avoid zoom; use `dvh` units; standalone storage is separate from Safari's; there is no install prompt event.

## 12. Design system: Blaze

### Concept

The name gives the idea. A trail is marked with blazes, upright rectangles of paint. In Hourtrail **each activity type is a blaze colour, each session is a blaze on the day's trail, and the day is the trail**. Three terms are used below:

- **Blaze**: an upright rounded rectangle in an activity type's colour.
- **Trail**: the line blazes sit on, vertical in History and a horizontal 24-hour ribbon on Home.
- **Wash**: a faint tint of the type colour, used as the background of the running-session panel.

Five rules keep it consistent:

1. **Colour means activity type and nothing else.** Chrome is ink on paper. Buttons, links, selection and focus are ink. The only other colours are danger and caution, used for text and icons and always with words.
2. **One face with character, for time.** National Park (the open-source typeface cut from US park trail signs) sets timers, figures and titles. Everything else is the system font, which pairs cleanly with Chinese.
3. **Lists, not cards.** Content sits directly on paper, separated by hairlines. Only overlays (sheets, menus, toasts) get a raised surface, and only the running panel gets a wash.
4. **One bold thing per screen**: the running panel on Home, the trail in History, the headline figure in Reports. Everything around it stays quiet.
5. **Text never sits on a blaze colour.** A blaze is a mark beside text, so contrast never depends on the type colour.

Avoid, because they would make it look generic: uppercase or letter-spaced labels, middle-dot separators, arrows appended to buttons, gradient fills, a shadow under static content, one radius on everything, and a card around every group.

### Colour tokens

All tokens are CSS custom properties prefixed `--ht-`, defined once in `apps/web/src/lib/styles/tokens.css` for light, and overridden under `@media (prefers-color-scheme: dark)` and `[data-theme]`. Components use tokens only; a stylelint rule rejects raw colours and off-scale lengths outside that file. Contrast ratios below were computed against paper and surface; keep the check as a unit test over the token file.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F1F4F0` | `#111614` | Page background (pale map paper, forest night) |
| `surface` | `#FFFFFF` | `#1A211E` | Sheets, menus, toasts, inputs |
| `sunken` | `#E4E9E3` | `#0B0F0D` | Ribbon track, pressed state |
| `ink` | `#17211D` | `#E8EDE9` | Text, primary buttons (≥ 13:1) |
| `ink-2` | `#4C5953` | `#A9B5AF` | Secondary text (≥ 6:1) |
| `ink-3` | `#66726C` | `#86938C` | Tertiary text, gap rows (≥ 4.5:1 on paper) |
| `line` | `#D5DBD5` | `#2B3531` | Hairlines, the trail |
| `line-strong` | `#7A8780` | `#66746D` | Control borders (≥ 3:1) |
| `danger` | `#B42318` | `#FF8A7A` | Destructive text and icons |
| `caution` | `#8A5300` | `#F2B84B` | Review and clock cautions |
| `brand` | `#1E3A31` | same | App icon and splash only |

Blaze palette (the `color` of an activity type). `mark` paints blazes, trail segments and chart bars (≥ 3.4:1 on paper as a graphic); `text` is for the rare coloured word in light mode (≥ 5.5:1); in dark mode the mark doubles as text.

| Key | Light mark | Light text | Dark mark |
|---|---|---|---|
| `lake` | `#2563C9` | `#1D55B3` | `#6CA0F5` |
| `saffron` | `#B87400` | `#8A5600` | `#F0B43C` |
| `fern` | `#2E8B57` | `#1F6E43` | `#5FC08A` |
| `rowan` | `#C8402F` | `#AD3122` | `#F0796A` |
| `heather` | `#7A4FBF` | `#6A3FB0` | `#AE8BEA` |
| `spruce` | `#0F7F86` | `#0B6A70` | `#45BAC0` |
| `rose` | `#C4477F` | `#A93669` | `#EE82B0` |
| `lichen` | `#6F7D12` | `#56620B` | `#B4C254` |
| `slate` | `#5B6B82` | `#4C5B70` | `#9AAAC2` |
| `bark` | `#8A5A3C` | `#774B30` | `#C99675` |

Wash is `color-mix(in srgb, var(--blaze) 12%, var(--ht-surface))` in light and 16% in dark; ink on any wash stays above 9.8:1. A component receives its type colour by setting `--blaze` on its root. A type is always named in text next to its blaze, so colour is never the only signal. Charts use the same mark colours: a type keeps its colour everywhere, and a work item's bar takes its default type's colour.

### Typography

- `--ht-font-display`: `"National Park", ui-rounded, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`. Self-host the variable font (weights 200–800, OFL 1.1; try `@fontsource-variable/national-park`, otherwise the files from the project's repository with the licence), Latin subset, `font-display: swap`, precached.
- `--ht-font-text`: `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`.
- Display roles use weight 600 so Chinese falling back to PingFang Semibold matches the Latin.
- Timers must not jitter. The font's tabular figures are unconfirmed, so render each timer character in a fixed-width inline cell (digits 0.62em, colons 0.3em); use `font-variant-numeric: tabular-nums` as well.

| Role | Size / line height | Weight | Face | Used for |
|---|---|---|---|---|
| `timer` | 64 / 1.0 (80 on desktop) | 600 | display | Elapsed time on the running panel |
| `figure` | 36 / 1.1 | 600 | display | Headline totals |
| `title` | 28 / 1.15 | 600 | display | Screen titles, day headings |
| `heading` | 21 / 1.25 | 600 | display | Section and sheet titles, running work item name |
| `body` | 17 / 1.4 | 400 (600 for emphasis) | text | Rows, inputs, notes |
| `label` | 15 / 1.35 | 400 | text | Field labels, secondary lines |
| `caption` | 13 / 1.3 | 400 | text | Times on the trail, axis labels. Nothing is smaller. |

Sentence case everywhere. Notes and descriptions wrap at about 70 characters on desktop.

### Space, shape, motion

- Spacing scale `--ht-space-1…8`: 4, 8, 12, 16, 24, 32, 48, 64. Page gutter 16 on phones, 24 from 768 px, 32 from 1024 px.
- Radii by role, not one value: blaze 2; controls and menus 12; filter chips fully round; sheets 20 on the top corners; the running panel has none on phones (a full-bleed band) and 16 on desktop.
- Hairlines are 1 px `line`; control borders 1 px `line-strong`. Overlays use `--ht-shadow-overlay: 0 8px 32px rgb(23 33 29 / 0.18)` in light and a `line` border in dark. Static content has no shadow.
- Touch targets at least 44 × 44. Start and Stop are 60 high and full width on phones.
- Focus: 2 px ink outline with 2 px offset, visible on every interactive element.
- Motion: 120 ms for presses, 200 ms for sheets and menus, easing `cubic-bezier(.2,.8,.2,1)`. The single authored moment is Start: the blaze paints in from top to bottom and the wash fades in over 320 ms. Nothing else moves by itself. Under `prefers-reduced-motion` use opacity only.
- Breakpoints: 768 px (two columns) and 1024 px (sidebar navigation). Layers: navigation 30, menus 40, sheets 50, toasts 60.
- App icon: three white blazes in the "start of trail" arrangement (one above two) on `brand`.

### Components

Build these once in `apps/web/src/lib/components/` and show every one, in every state and both themes, on an unlinked `/dev/gallery` route. Pages compose them and add no colours or sizes of their own.

| Component | Specification |
|---|---|
| `Blaze` | Upright rectangle, radius 2. Sizes 4×14, 6×20, 8×28. An archived type shows as an outline. |
| `TypeTag` | Blaze plus the type name in ink. |
| `Button` | Primary (ink fill, paper text), secondary (outline), quiet (text only), danger (danger text and outline). Heights 60, 48 and 36 (36 on desktop only). The label says what happens: "Stop", "Save changes", "Download backup". Start and Stop are primary ink buttons; there is no green or red. |
| `RunningPanel` | Wash band with TypeTag, work item name (`heading`), elapsed (`timer`), one line "Started 4:02 AM at 第1寺院", then Stop (wide) and Switch (narrow). Untitled sessions show a "Name this session" field in place of the name. |
| `DayRibbon` | Horizontal 24-hour track, 12 px tall on `sunken`; sessions are segments in their mark colour; a 2 px ink tick marks now; captions at 12a, 6a, 12p, 6p. Tapping a segment opens that session. |
| `TrailList` | History's vertical trail: a 32 px rail with the trail line; each session row has its start time in `caption` at the left, a 4 px mark-coloured segment on the rail for the row's height, then name, "Work at 第1寺院", the note's first line, and the duration right-aligned. Rows are not to scale; the ribbon above gives the scale. |
| `GapRow` | Dashed trail segment, `ink-3` text "1h 30m not recorded", quiet "Add" button. |
| `WorkItemRow` | Blaze, name, project in `label`, and a trailing 44 px Start button. Tapping the row starts it; a long press or the trailing menu opens details. |
| `Field` and inputs | Label above, hint below, inline error. Text input, auto-growing text area, native select on phones, native `datetime-local`, switch, stepper, segmented control. Inputs are `surface` with a `line-strong` border, 48 high, 17 px text. |
| `Sheet` | Bottom sheet on phones (scrim, close button, safe-area padding, no drag gesture needed), centred dialog 480–560 px on desktop. Owns focus trapping and return. |
| `ConfirmDialog`, `Menu`, `Toast`, `Banner` | Toasts sit above the tab bar for six seconds and can carry Undo. Banners are inline notices (neutral, caution, danger) with an icon and a sentence. |
| `SyncBadge` | Icon and words for the states in section 6. Tapping opens sync details. |
| `TabBar` and `Sidebar` | Five destinations: Home, History, Items, Reports, Settings. Bottom bar with icon and label on phones; a 220 px sidebar from 1024 px. The selected item is ink with a small horizontal blaze; unselected items are `ink-2`. |
| `StatTile`, `BarChart`, `HBarList`, `DataTable` | Inline SVG charts drawn by hand, no chart library. Bars are mark colours with a 2 px gap between stacked segments, values in text beside or above, a table of the same numbers below every chart. |
| `EmptyState` | One sentence and one action: "No sessions on this day. Add session". |
| `ReviewItem` | Icon, one neutral sentence, and inline actions. |

### Voice

Plain verbs, sentence case, no exclamation marks, no apology. One name per thing through the whole app: Start, Stop, Switch, Add session, Work item, Activity type, Place, Note, Not recorded, Untitled session, Backed up, On this device only. An error says what happened and what to do: "Couldn't reach the cloud. Your changes are saved on this phone and will upload when you're back online." Durations read `2h 14m` in lists and `2:14:07` on the live timer; times and dates follow the device locale.

### Keeping the build on the design system

This section, once it is `docs/DESIGN_SYSTEM.md`, is the contract. The direction is decided; implementation applies it and does not reopen it. Conformance comes from four things, in this order of reliability:

1. **Mechanical checks.** The stylelint rule (tokens only, no raw colours, no off-scale lengths), the contrast test over `tokens.css`, and `svelte-check`. These run in `pnpm check`, so Codex cannot pass a task while breaking them.
2. **One component library.** Pages may only compose components from `src/lib/components/`. A UI brief names the components to use and cites the DESIGN_SYSTEM subsections that apply. Codex may not add a token, a colour, a font size or a new shared component; if it needs one, it reports `blocked` or lists it under `docs_notes`, and you decide.
3. **The fixed screenshot set.** `pnpm shots` renders every route at 390×844 and 1280×800 in light and dark with Chinese seed data. You open the images for every UI task.
4. **The review checklist below**, applied by you to those screenshots.

Design review checklist for every UI task:

- Colour appears only as an activity type's blaze, trail segment, chart bar or wash. Buttons, links, selection and focus are ink.
- Timers, figures and titles are in the display face; everything else is the system face. No size outside the type table; nothing below 13 px.
- No card around a list, no shadow on static content, no text on a blaze colour, at most one wash on the screen.
- None of the "avoid" items: uppercase or tracked labels, middle-dot separators, arrows on buttons, gradients, one radius everywhere.
- Every type colour has its name beside it. Chinese names and a long English name both fit without clipping at 390 px.
- Targets are at least 44 px; Start and Stop are 60 px; focus is visible when tabbing; the layout respects safe areas.
- Wording uses the vocabulary in Voice; empty and error states say what to do next.
- Both themes look intended, not inverted by accident.

**Whether to load the `frontend-design` skill.** That skill is for making new visual decisions, and it pushes toward taking aesthetic risk. Routine conformance review does not need it, and Codex agents do not have it; the checklist and the mechanical checks do that job. Load it yourself at three points only:

- **Task 0.4 and Gate 0**, when the system first becomes pixels and gaps in this specification show (a state or component not described here).
- **Whenever a screen needs something this document does not cover**: a new component, a new layout, a new chart. Make the decision with the skill, write it into `DESIGN_SYSTEM.md` first, then brief Codex against the updated document.
- **Task 4.6**, the polish pass over the whole app.

When you load it, treat this document as the brief that already pins the direction (the skill's own rule is that the brief's words win): extend Blaze by its five rules, and do not replace the palette, the faces or the layout concept. If the `dataviz` skill is available, load it before briefing task 4.2 for chart mark and interaction rules, keeping the type colours defined here.

## 13. Screens and flows

### Home (phone)

```
 Thu 12 Nov                 Backed up        Thu 12 Nov                 Backed up
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 ▮ Work                                      Not tracking
 库存管理系统开发                             ┌──────────────────────────────────┐
 2:14:07                                     │              Start               │
 Started 4:02 AM at 第1寺院                   └──────────────────────────────────┘
 ┌───────────────────────┐ ┌────────┐         Search or name a work item
 │         Stop          │ │ Switch │
 └───────────────────────┘ └────────┘
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 Today    5h 12m work    1h 05m other         Today    3h 00m work
 ░░░░████░░██████░░░▒▒░░|░░░░░░░░░░░           ░░░░████░░░░░░░░░░░░░|░░░░░░░░░░░░
 12a     6a      12p      6p

 Yesterday: 3 things to check
 Pinned
 ▮ Inventory Software Development  ▷
 ▮ Building Maintenance            ▷
 Recent
 ▮ 修复洗手台                        ▷
```

- Idle: the Start button begins an untitled session. Tapping a pinned or recent row starts that item at once. Typing in the field filters items; Enter on a new name creates the item (default type Work) and starts it.
- Running: tapping a row, or Switch, switches. The TypeTag opens a type picker. The name opens the item picker. A session can be named, typed and noted at any time without stopping it.
- After Stop: a toast "Stopped at 7:00 AM. 2h 58m" with Undo and "Add note", which opens the session editor. Nothing is required.
- On desktop the running panel and today's summary sit in a left column and the item lists in a right column.

### History

- Phone: a date header with previous and next, the DayRibbon, the day's totals, then the TrailList with GapRows. Tapping a session opens the session editor sheet; tapping a GapRow's Add opens it prefilled with the gap's bounds. A "Review" control at the top opens Daily review for that day when it has issues.
- Desktop: a day list and trail on the left, the session editor as a permanent right pane, and a search bar with filters (text across item names and notes, type, project, place, date range) that turns the left pane into a results table.

### Session editor (sheet or pane)

Work item picker, type, start and end (`datetime-local`), computed duration, note (large text area), place (picker, "Remove coordinates"), then Split, Merge with adjacent, Delete. Changes save on blur with a brief "Saved" confirmation. Warnings (overlap, long duration) appear inline as caution banners.

### Items, Reports, Settings

- **Items**: search, pinned first, then active items grouped by project, with an archived section. The item page shows its fields, total time and its sessions.
- **Reports**: a segmented range control, the headline figure "Work hours" with other types beside it, the bar chart by day, breakdown tabs (Work items, Projects, Places), then "Create report", which opens the report builder with a live print preview and Export (Print, CSV, Excel).
- **Settings**: Activity types (reorder, colour, counts as work, reminders, archive), Places, Reminders, Cloud and devices (sync state, link a device, revoke), Privacy (location capture, raw coordinates), Backup (download, restore, last nightly backup), Appearance (system, light, dark), Time zone and week start, Deleted sessions, About.

## 14. Platform limits and trade-offs (checked 2026-11-12)

| Fact | Consequence |
|---|---|
| Workers free: 100,000 requests/day, **10 ms CPU** per request and per cron run, 50 subrequests, 5 Cron Triggers per account | No slow password hashing (hence the account key). Batches capped at 50 mutations. Reports and backup files are built in the browser. Measure CPU at the Milestone 3 gate with `wrangler tail`. |
| D1 free: 5 M rows read/day, 100,000 rows written/day, 5 GB; queries stop when a daily limit is hit | Fine for one user (a few thousand sessions a year). A "Replace everything" restore of a very large history could approach the write limit; the restore UI should upload in resumable batches. |
| iOS Web Push works only for Home Screen apps (16.4+); Declarative Web Push from 18.4 | Reminders are best effort, with the in-app fallback. |
| iOS has no Background Sync and suspends timers | Sync runs only while the app is open; elapsed time is derived from timestamps. |
| Installed PWAs are bound to their origin | Production origin fixed from Milestone 1. |
| Browser storage can be evicted | Persistence request, sync state, backup nudge, full-pull recovery. |
| No map tiles (privacy, cost) | Places are set from the current position or typed coordinates; there is no map picker. |
| Conflict resolution is per field with the later edit winning | Simple and predictable; the losing value is always kept in a conflict record. |

If a limit forces a compromise during implementation, record it in `docs/SPEC.md` with the simplest alternative and tell the owner at the next gate.

## 15. Delegating to Codex

### What exists and what changes

`temple_inventory` (at `~/code/frappe_docker_wsl/development/frappe-bench/apps/temple_inventory`) has a working method: `scripts/codex-run NAME BRIEF` runs `codex exec` in the background with a workspace-write sandbox, writes `/tmp/codex-runs/NAME.{log,last,exit,session}`, and `scripts/codex-watch` emits heartbeats for a Monitor; the orchestrator then verifies by hand. Read those two scripts and `docs/agents/codex.md` there before writing Hourtrail's versions. Keep its core discipline (a Codex report is a claim, not verification) and make these changes:

| Weakness observed | Change for Hourtrail |
|---|---|
| All tasks share one working tree and Codex cannot commit, so parallel work is separated only by convention | One **git worktree and branch per task** (`.worktrees/NAME`, branch `task/NAME`). You commit in the worktree after verifying, rebase on `main`, fast-forward merge, remove the worktree. |
| The final report is free prose that must be read and interpreted | `--output-schema scripts/agent/report.schema.json` so the final message is JSON: `status` (`done`/`partial`/`blocked`), `summary`, `files_changed`, `checks[{command, result, detail}]`, `tests_added`, `deviations`, `assumptions`, `questions`, `docs_notes`, `screenshots`. |
| Session id is grepped from a multi-megabyte text log | `--json` event stream to `events.jsonl`; take the session id from it. Parse with `node` (there is no `jq` on this machine). |
| A separate watcher must be re-armed every 20 minutes | The runner contains its own watchdog: it ends the run with exit 124 after `--timeout` minutes (default 75) or 125 after `--stall` minutes without an event (default 15). Launch it with Bash `run_in_background`; the harness notifies you when it exits. Do not poll and do not arm a Monitor. |
| Scope and test integrity are checked by eye | The runner writes `summary.txt`: report status, changed paths, any path **outside the brief's `owned` globs**, diffstat, and the number of test cases removed or skipped. `scripts/agent/verify NAME` then runs the checks itself and compares test counts with `main`. |
| Runs live in `/tmp/codex-runs`, shared with another project and lost on reboot | `.agent-runs/NAME/` inside the repo, gitignored: `brief.md`, `events.jsonl`, `report.json`, `summary.txt`, `session`, `exit`, `shots/`. |
| Codex has no way to ask a question | The brief tells it to stop and return `status: "blocked"` with `questions` when a decision is missing. You answer with `--resume`. |
| Heavy commands from different projects compete for 13 GB of RAM | `scripts/heavy` takes the same lock file `temple_inventory` uses (`~/code/frappe_docker_wsl/development/.locks/heavy.lock`) when that directory exists, otherwise `/tmp/hourtrail-heavy.lock`. Builds, Playwright and full test runs go through it, so memory-heavy steps queue no matter how many agents are running. |
| Secrets could leak into an agent's environment | The runner starts Codex with a minimal environment (PATH, HOME, locale, per-task ports) and never passes Cloudflare or GitHub credentials. Only you deploy. |

### `scripts/agent/codex-run`

```
scripts/agent/codex-run NAME BRIEF [--model M] [--effort low|medium|high|xhigh]
                        [--resume SESSION | --fork SESSION] [--timeout MIN] [--stall MIN]
```

1. Create `.worktrees/NAME` on `task/NAME` from `main` (reuse it on resume) and run `pnpm install --frozen-lockfile --prefer-offline` there.
2. Create `.agent-runs/NAME/`, copy the brief in, and assign a port block (`HT_PORT_BASE`) so two tasks' dev servers and Playwright runs do not collide; every config reads its ports from that variable.
3. Run, with the brief on stdin:
   `codex exec [resume|fork SESSION] --json -C <worktree> -m <model> -c model_reasoning_effort="<effort>" -c sandbox_mode="workspace-write" -c approval_policy="never" -c sandbox_workspace_write.network_access=true -c sandbox_workspace_write.writable_roots=[run dir, ~/.cache, /tmp, lock dir] --output-schema scripts/agent/report.schema.json -o .agent-runs/NAME/report.json -`
   Always pass the model and effort explicitly: the owner's `~/.codex/config.toml` defaults to `gpt-6.1-sol` at low effort. Do not use fast mode.
4. Watchdog as described; write `exit` and `session`.
5. Write and print `summary.txt`.

These flags exist in the installed `codex-cli 0.166.0` (`--json`, `--output-schema`, `-o`, `-C`, `-m`, `-c`, `exec resume`, `exec fork`, `exec review`). The JSON event shapes and whether `--output-schema` applies on resume are **not verified**: the first task of Milestone 0 is a smoke run with a trivial brief. If structured output fails, fall back to a prose final message under fixed headings and take the session id from the log's `session id:` line as `temple_inventory` does.

### Briefs

Use `scripts/agent/brief-template.md`. Front matter: `owned` (globs Codex may edit), `read_only` (paths it must not touch), `checks` (exact commands that must pass). Body, in this order: goal in two sentences; context with `file:line` pointers and the SPEC or DESIGN_SYSTEM sections that apply; the contract to honour (types and function signatures, copied in); acceptance criteria as observable behaviour; evidence required (tests to add, screenshots into `.agent-runs/NAME/shots/`); what is out of scope; the instruction to stop and report `blocked` instead of guessing; no new dependencies unless listed; do not commit.

Brief sizing: one task is one coherent change that you can review in one sitting (roughly up to 600 changed lines). Split anything larger.

### Model routing

| Work | Model and effort |
|---|---|
| Scoped UI, CRUD screens, wiring, exports, test writing | `gpt-6-luna`, medium |
| Multi-file UI flows with state (Home, session editor, History, review, reports) | `gpt-6-luna`, high |
| `packages/core` logic, the repository and outbox layer, sync client and server, auth, service worker and updates, Web Push, backup format | `gpt-6.1-sol`, high |
| Second-opinion review of auth, sync, time and migration changes | `codex exec review --base main -m gpt-6.1-sol` in the worktree, in addition to your own review |
| A task that still fails after two fix rounds | Stop sending it back. Implement it yourself in the worktree, or hand it to a Claude subagent (Sonnet for scoped work, Opus for hard logic) with the brief, the diff so far and what failed. Do not use `gpt-6-astra`. |

**How many at once.** Worktrees and the heavy lock make parallel runs safe, and five Codex tasks have run together on this machine. The real limits are disjoint `owned` globs and how fast you can verify, since an unreviewed pile of finished tasks is worth less than a steady merge rate. As a working rule run three to five scoped UI tasks together, keep `packages/core` and sync tasks to one or two at a time because other work depends on their interfaces, and drop back when `free -g` shows under 4 GB available or `temple_inventory` runs are active.

### Your loop for each task

1. Write the brief. For tasks that share an interface, land the types in `packages/core` first (contract first), then run consumers in parallel with disjoint `owned` globs. Only one running task may add dependencies, because of the lockfile.
2. Launch the runner in the background. Carry on with other work.
3. When notified, read `summary.txt` and `report.json`. Read `events.jsonl` only to diagnose a failure.
4. Verify independently, in the worktree: run `scripts/agent/verify NAME` (format, lint, types, unit tests, build, and E2E when the task touches UI or sync, all under `scripts/heavy`); read the whole diff against the brief and the SPEC; compare test edits with intent (Codex has weakened assertions before); open every screenshot and check that real data, Chinese text, both themes and the 390 px width are present. A blank or loading screenshot is a failure.
5. Fix rounds: trivial fixes yourself; anything substantive goes back with `--resume SESSION` and a short fix brief (use `--fork` if resume reports an active writer). After two rounds, take it over as the routing table says.
6. Commit in the worktree with a Conventional Commit and a why-body, rebase on `main`, fast-forward merge, push, remove the worktree, update `docs/PROGRESS.md` and the changelog line in `UI_UX_DECISIONS.md` when behaviour changed.

Screenshots need a Chinese font. The host has only Droid Sans Fallback; install Noto Sans CJK SC into `~/.local/share/fonts` (no sudo needed) before the first visual review.

## 16. Milestones and tasks

Tasks marked ∥ can run in parallel with the task before them. "You" means the orchestrator does it directly.

### Milestone 0: foundation

| ID | Task | Who |
|---|---|---|
| 0.1 | `git init`, workspace scaffold, lint, format, type and test tooling, `scripts/heavy`, the documents in section 3, private GitHub repo `hourtrail`, CI workflow running the checks | You |
| 0.2 | `scripts/agent/*` and the smoke run | You |
| 0.3 | `tokens.css`, base styles, font, the contrast test | You (copy the values from section 12 exactly) |
| 0.4 | Component primitives and `/dev/gallery`; `pnpm shots` | Sol high. Load `frontend-design` for your review (section 12). |
| 0.5 | Worker serving the built shell, manifest, icons; deploy to staging **and production** | You, after the owner runs `pnpm exec wrangler login` |

**Gate 0 (owner):** approve gallery screenshots (phone and desktop, light and dark, Chinese sample content), and install the production shell on the iPhone to confirm it opens standalone with correct safe areas.

### Milestone 1: core recording (local only)

| ID | Task | Who |
|---|---|---|
| 1.1 | `core`: schemas, ids, `time` with DST, overnight and minute-allocation property tests | Sol high |
| 1.2 | `core/applyMutation`; Dexie stores, repository layer and outbox; Start, Stop and Switch transactions; undo | Sol high |
| 1.3 | Activity types settings | Luna medium ∥ |
| 1.4 | Work items and projects: list, search, edit, pin, archive | Luna medium ∥ |
| 1.5 | Home: bare Start, start from a row, running panel, naming, DayRibbon, today's totals | Luna high |
| 1.6 | Session editor, manual entry, delete with undo, validation and warnings | Luna high |
| 1.7 | History: day navigation, TrailList, GapRow to manual entry, midnight slices | Luna high ∥ |
| 1.8 | Service worker, offline shell, update prompt, install hint, storage persistence, Dexie upgrade test harness | Sol high |
| 1.9 | Backup file download | Luna medium ∥ |
| 1.10 | E2E for scenarios A, B, C, D and local Unicode; kill-and-reload persistence tests | Luna high |

**Gate 1:** scenarios A–D pass in Chromium and WebKit; sessions survive reload, tab kill and an app update; owner uses it on the iPhone for real.

### Milestone 2: daily organisation

| ID | Task | Who |
|---|---|---|
| 2.1 | Switch flow polish and the two-running resolver | Luna high |
| 2.2 | `core` split, merge and overlap detection; editor actions | Sol high, then Luna medium |
| 2.3 | `core/review`; Daily review screen; Home's review row | Sol high, then Luna high |
| 2.4 | Places library: add, edit, radius, merge duplicates, archive | Luna medium ∥ |
| 2.5 | `core` place matching; capture on Start and Stop; unknown-place prompts; privacy controls | Sol high, then Luna high |
| 2.6 | Search and filters; desktop two-pane History | Luna high |
| 2.7 | Desktop layout pass across all screens | Luna medium, your visual review |

**Gate 2:** scenario E with mocked geolocation (sure, suggested, ambiguous, unresolved, low accuracy, denied, timed out) and on the real phone; review flows; Start never waits on GPS (test with a geolocation call that never returns).

### Milestone 3: cloud

| ID | Task | Who |
|---|---|---|
| 3.1 | Worker skeleton: Hono, D1 migrations, security headers, error shape | Sol high |
| 3.2 | Auth endpoints, lockout, cookies; sign-in, link-device and devices screens; `setup-account` | Sol high, plus `codex exec review` |
| 3.3 | Sync push and pull with idempotency, concurrency and merge tests | Sol high, plus `codex exec review` |
| 3.4 | Client sync engine, SyncBadge and details, conflict surfacing in review | Sol high |
| 3.5 | Restore from a backup file (both modes) | Luna high |
| 3.6 | `hourtrail-backups` repo, nightly workflow, `setup-backup-key`, `restore-drill`, heartbeat | Luna medium ∥ |
| 3.7 | Erase account, raw-coordinate sync toggle and cloud deletion | Luna medium |
| 3.8 | Two-device E2E (two browser contexts against `wrangler dev`): scenarios G, H, I, L | Luna high |

**Gate 3:** scenarios G, H, I, L; duplicate and replayed batches create nothing twice; an offline edit on each device to the same field produces one winner and one conflict record; unauthenticated and revoked-device requests get 401; restore drill passes from both a backup file and a nightly dump; CPU per request is under the limit. Then the owner runs `setup-account` and `setup-backup-key` for production and approves the production deploy; the phone's existing local data uploads on first sign-in.

### Milestone 4: reporting and reminders

| ID | Task | Who |
|---|---|---|
| 4.1 | `core/report` aggregation with tests for type exclusion and totals | Sol high |
| 4.2 | Statistics screen and charts | Luna high |
| 4.3 | Report builder, presets, printable view | Luna high |
| 4.4 | CSV and XLSX export with the Unicode round-trip test | Luna medium ∥ |
| 4.5 | Push subscription, cron handler, VAPID send, service worker handlers, reminder settings, "Still working?" sheet | Sol high |
| 4.6 | Polish: accessibility pass (keyboard, VoiceOver labels, contrast), dark mode, empty states, bundle size, copy review against section 12 | Luna medium, your review |

**Gate 4:** scenarios F, J, K and a full A–L regression; a real push arrives on the installed iPhone app; a monthly report prints cleanly and opens in Excel with Chinese intact.

## 17. Verification

Commands (define them in the root `package.json`): `pnpm check` (format, lint, types, unit tests), `pnpm build`, `pnpm e2e` (Playwright, Chromium and WebKit iPhone profile, against `wrangler dev` with a fresh local D1), `pnpm shots` (fixed screenshot set: every route at 390×844 and 1280×800, light and dark, with Chinese seed data). CI runs `check`, `build` and `e2e` on every push and deploys `main` to staging.

| Scenario | Automated proof | Owner check on device |
|---|---|---|
| A Quick start | E2E: tap a recent item, session exists with no form | Gate 1 |
| B Resume | E2E with a mocked clock: two sessions, one work item | Gate 1 |
| C Details later | E2E: different notes on two sessions, item unchanged | |
| D Historical entry | E2E: two sessions yesterday appear in History and totals | |
| E Place recognition | Unit tests for matching; E2E with mocked geolocation | Gate 2 |
| F Forgotten session | Worker test for the cron decision; E2E for the sheet and corrected totals | Gate 4, real push |
| G Offline | E2E: offline start and stop, reload, go online, record on server | Gate 3, airplane mode |
| H Desktop edit | Two-context E2E: edit on one, appears on the other, no duplicate | Gate 3 |
| I Unicode | Two-context E2E plus the export round-trip test | Gate 4 |
| J Monthly report | Unit tests on `core/report`; E2E for the print view | Gate 4 |
| K Custom types | E2E: create, rename, reorder; totals follow `counts_as_work`; Overhead sessions stay out of work hours even when the type is renamed | |
| L Recovery | E2E: backup, clean profile, restore, deep-compare; `restore-drill` | Gate 3 |

PRD section 18's failure list maps to tests you must see pass: repeated taps (unit, on the transactions), duplicate requests (Worker), app killed mid-session (E2E reload), GPS unavailable or late (E2E), DST and zone change (unit), clock change (unit on the flag), overlapping entries (unit and E2E), update with existing data (Dexie upgrade test), restore (E2E).

## 18. First actions and what to ask the owner for

Start with tasks 0.1–0.3; they need nothing from the owner. Then ask, each at the point it is needed:

| When | Owner action |
|---|---|
| Before 0.5 | Run `pnpm exec wrangler login` once in the repo (browser sign-in to Cloudflare). |
| After 0.5 | Add a Cloudflare API token as the GitHub Actions secret for staging deploys. Give them the exact `gh secret set` command to run so the token is never pasted into the conversation. |
| Gate 0, 1, 2, 4 | Review screenshots; try the build on the iPhone. |
| Gate 3 | Run `scripts/setup-account --env production` and `scripts/setup-backup-key`; store both secrets in the password manager; approve the production deploy. |

No other keys are needed. There is no AI service, no map service, no email service and no paid plan.
