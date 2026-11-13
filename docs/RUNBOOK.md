# Hourtrail runbook

Operational procedures: setup, deploy, keys, backups, restore and recovery. Architecture is in [SPEC.md](SPEC.md). Sections marked _(to be completed by task X)_ are filled in when that task lands; until then they state the intended procedure.

## Local setup

1. Node 26 and pnpm 12 native Linux binaries in `~/.local/bin` (the global `wrangler` on PATH is a Windows binary and fails; always use `pnpm exec wrangler`).
2. `pnpm install`
3. `pnpm check` (format, lint, types, unit tests), `pnpm build`.
4. Playwright browsers `chromium-1254` and `webkit-2388` must be in `~/.cache/ms-playwright` (they match the pinned Playwright 1.65.0). After a Playwright upgrade, run `pnpm exec playwright install chromium webkit`.
5. Screenshots need Noto Sans CJK SC in `~/.local/share/fonts` (then `fc-cache -f`).
6. Memory-heavy commands go through `scripts/heavy` (`/tmp/hourtrail-heavy.lock`, Hourtrail only).

## Environments and addresses

| Environment | Address                                   | Deployed by                                     |
| ----------- | ----------------------------------------- | ----------------------------------------------- |
| Local       | `wrangler dev` with local D1              | anyone                                          |
| Staging     | `hourtrail-staging.<account>.workers.dev` | GitHub Actions on every push to `main`          |
| Production  | `hourtrail.<account>.workers.dev`         | the orchestrator, by hand, after owner approval |

The production origin must never change: an installed iPhone app is bound to it.

## One-time owner actions (done together on 2026-11-12)

| Action                                                                                                                                            | Why                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm exec wrangler login` in the repo                                                                                                            | Orchestrator deploys and manages D1                  |
| GitHub token: access to `hourtrail` and `hourtrail-backups` with Contents, Workflows, Administration, Actions, Secrets and Variables (read/write) | Push, CI, repo secrets and variables                 |
| Cloudflare API token "Edit Cloudflare Workers" + D1 Edit, set as `CLOUDFLARE_API_TOKEN` in `hourtrail`                                            | CI staging deploys                                   |
| Cloudflare API token with D1 Edit only, set as `CLOUDFLARE_D1_TOKEN` in `hourtrail-backups`                                                       | Nightly `wrangler d1 export`                         |
| `age-keygen`: private key to the password manager, recipient as the `AGE_RECIPIENT` variable in `hourtrail-backups`                               | Encrypting nightly dumps                             |
| `scripts/setup-account --env production` in the owner's own terminal                                                                              | Production account key; never in an agent transcript |

The account ID (`c41859cdba545f9c1b16de4357176e53`) is not secret and lives in the `CLOUDFLARE_ACCOUNT_ID` repository variable. The staging account key is in `.secrets/staging-account-key` (gitignored, mode 600) for the orchestrator's tests.

## Deploy _(to be completed by task 0.5)_

- Staging: automatic from `main` (`.github/workflows/ci.yml`).
- Production: `pnpm build`, then `pnpm exec wrangler d1 migrations apply DB --env production --remote`, then `pnpm exec wrangler deploy --env production` (both from `apps/worker`) from a clean `main`, only after owner approval at a gate. From the first production deploy, every IndexedDB schema change ships with an upgrade function and a fixture test.
- D1 migrations: `pnpm exec wrangler d1 migrations apply DB --env <env> --remote` before deploying a Worker that needs them. CI applies staging's on every `main` deploy; production's are applied by hand as above. Migrations only add; never edit a landed one.

## Account key and devices _(to be completed by task 3.2)_

- `scripts/setup-account --env <staging|production>` generates the 160-bit account key (shown once as `HT1-XXXXX-…`), stores its SHA-256 as the Worker secret `ACCOUNT_KEY_HASH` and generates the VAPID key pair. The orchestrator runs it for staging. **The owner runs it for production in their own terminal**, so the production key never enters an agent transcript.
- Each device enrols once with the account key and then holds its own revocable session cookie (400 days). A signed-in device links another by QR code (Settings → Cloud and devices → Link a device).
- Revoke a device: Settings → Cloud and devices → Revoke.

## Backups _(backup file 1.9, nightly dump 3.6; restore UI 3.5)_

Three independent lines of defence:

1. **Backup file**: Settings → Backup → Download backup writes `hourtrail-backup-YYYY-MM-DD.json` (on iPhone via the share sheet). The app nudges after 30 days.
2. **Nightly dump**: the private `ruoshui-git/hourtrail-backups` repo runs a scheduled workflow: `wrangler d1 export --remote`, encrypted with `age` to the owner's recipient, committed as `dumps/YYYY/hourtrail-YYYY-MM-DD.sql.age`, pruned to 60 dailies plus the first of each month. It always updates `last-run.txt` (GitHub disables scheduled workflows after 60 days without activity) and calls `POST /api/backup/heartbeat`, so Settings shows "Last nightly backup". A failed run emails the owner through GitHub. Its Cloudflare token is scoped to D1 read/export only.
3. **D1 Time Travel**: free-plan retention to be verified and recorded here.

Nightly dump details (task 3.6, set up 2026-11-13):

- The workflow lives in `ops/hourtrail-backups/` here and is published to the root of `ruoshui-git/hourtrail-backups` (copy the directory's contents, commit, push). Repo secrets: `CLOUDFLARE_D1_TOKEN`, `BACKUP_HEARTBEAT_SECRET` (production, set with `scripts/setup-heartbeat --env production` at the Milestone 3 production deploy), `BACKUP_HEARTBEAT_SECRET_STAGING`. Variables: `CLOUDFLARE_ACCOUNT_ID`, `AGE_RECIPIENT` (the owner's key), `AGE_RECIPIENT_STAGING`, and `NIGHTLY_ENABLED`.
- Scheduled runs (07:17 UTC) are skipped until `NIGHTLY_ENABLED=true`, set when production first serves the backup routes. Manual runs: Actions → Nightly D1 backup → Run workflow, with `env` = production or staging.
- `wrangler d1 export` makes the database unavailable to queries while it runs (seconds at this size). At 03:17 New York time that is harmless: the app works offline and sync retries.
- Staging dumps go to `dumps-staging/`, encrypted to a staging-only key whose private half is `.secrets/staging-backup.key` on the orchestrator's machine (never used for production). Drills run on those.
- First drill, 2026-11-13: staging seeded through the real app (sign-in, three sessions with Chinese names, sync), workflow run 43414572831, `scripts/restore-drill dumps-staging/2026/hourtrail-2026-11-13.sql.age --identity .secrets/staging-backup.key`: 1 device, 4 activity types, 3 work items, 3 sessions, 1 setting, 5 batches, all matching the live staging database.

`scripts/setup-backup-key` (owner runs it) creates the `age` key pair, prints the private key once for the password manager and sets the recipient as a repo variable.

## Restore procedures

### From a backup file

Settings → Backup → Restore, pick the file. The app validates version and schema and shows counts and the date range. Choose:

- **Add what's missing**: only records whose ids are not present.
- **Replace everything**: typed confirmation; a backup of the current state is saved first.

Restore writes locally and queues `mode: "restore"` batches, so it works on a clean install before or after sign-in, and ids (hence relationships) are preserved.

### From a nightly dump

1. Get the private `age` key from the password manager.
2. `scripts/restore-drill <dump.sql.age>` decrypts the dump, loads it into a fresh local D1 and compares record counts per entity.
3. To restore production (replaces cloud data, so **the owner approves step 6 first**):
   1. Download the dump from `ruoshui-git/hourtrail-backups` and decrypt it: `age -d -i <key file> hourtrail-YYYY-MM-DD.sql.age > dump.sql`. Run `scripts/restore-drill` on it first.
   2. Create a new database instead of overwriting the current one: `pnpm exec wrangler d1 create hourtrail-production-restore-YYYYMMDD` (from `apps/worker`).
   3. Load it: `pnpm exec wrangler d1 execute hourtrail-production-restore-YYYYMMDD --remote --file dump.sql`. The dump includes the schema and the `d1_migrations` table, so migrations stay in step.
   4. Check counts against the drill's table: `pnpm exec wrangler d1 execute hourtrail-production-restore-YYYYMMDD --remote --command "SELECT entity, COUNT(*) FROM records GROUP BY entity"`.
   5. Export the newest backup file from the most up-to-date device (Settings → Backup), because devices may hold records newer than the dump.
   6. Point `env.production.d1_databases[0].database_id` in `apps/worker/wrangler.jsonc` at the new database, commit, and deploy production. Keep the old database until the owner confirms the restore.
   7. On the device from step 5, restore that backup file with "Add what's missing" (task 3.5). It queues restore batches, which put back anything newer than the dump. Device sessions survive, because `devices` is in the dump.

## Lost or replaced phone

1. Install the app from the production address (Safari → Share → Add to Home Screen).
2. Sign in with the account key, or link the new phone from the desktop by QR code.
3. An empty local database with a valid session triggers a full pull; everything that had synced comes back.
4. Revoke the lost phone in Settings → Cloud and devices.

Anything recorded on the lost phone that never synced is gone unless a backup file has it; the sync badge ("Backed up" vs "N changes waiting") is how the owner knows.

## Lost account key

1. On any still-signed-in device, keep using the app; existing device sessions stay valid.
2. Rotate: the owner runs `scripts/setup-account --env production` again (new key, new hash secret). Existing device sessions are unaffected because they are separate tokens; revoke any you do not recognise.
3. If no device is signed in, rotate the key, then sign in again on each device. Data is untouched.
   | 2026-11-12 | production | 6470aee | Milestone 2 (daily organisation) after Gate 2's automated checks |
   | 2026-11-13 | production | 512f5e1 | Milestone 3 (cloud sync, sign-in, restore, nightly backups, privacy and erase) plus 4.1–4.4 (statistics, report builder, CSV/XLSX) after Gate 3's automated checks; migration 0001 applied; heartbeat secret set, NIGHTLY_ENABLED=true, first production backup run succeeded |
   | 2026-11-13 | production | 19e8f90 | Milestone 4 (statistics, report builder and printing, CSV/XLSX, reminders with the five-minute cron and Web Push, polish pass) after Gate 4's automated checks; no migrations |
