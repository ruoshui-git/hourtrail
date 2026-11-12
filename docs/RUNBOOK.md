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
- Production: `pnpm build && pnpm exec wrangler deploy --env production` from a clean `main`, only after owner approval at a gate. From the first production deploy, every IndexedDB schema change ships with an upgrade function and a fixture test.
- D1 migrations: `pnpm exec wrangler d1 migrations apply <db> --env <env> --remote` before deploying a Worker that needs them.

## Account key and devices _(to be completed by task 3.2)_

- `scripts/setup-account --env <staging|production>` generates the 160-bit account key (shown once as `HT1-XXXXX-…`), stores its SHA-256 as the Worker secret `ACCOUNT_KEY_HASH` and generates the VAPID key pair. The orchestrator runs it for staging. **The owner runs it for production in their own terminal**, so the production key never enters an agent transcript.
- Each device enrols once with the account key and then holds its own revocable session cookie (400 days). A signed-in device links another by QR code (Settings → Cloud and devices → Link a device).
- Revoke a device: Settings → Cloud and devices → Revoke.

## Backups _(to be completed by tasks 1.9, 3.5, 3.6)_

Three independent lines of defence:

1. **Backup file**: Settings → Backup → Download backup writes `hourtrail-backup-YYYY-MM-DD.json` (on iPhone via the share sheet). The app nudges after 30 days.
2. **Nightly dump**: the private `ruoshui-git/hourtrail-backups` repo runs a scheduled workflow: `wrangler d1 export --remote`, encrypted with `age` to the owner's recipient, committed as `dumps/YYYY/hourtrail-YYYY-MM-DD.sql.age`, pruned to 60 dailies plus the first of each month. It always updates `last-run.txt` (GitHub disables scheduled workflows after 60 days without activity) and calls `POST /api/backup/heartbeat`, so Settings shows "Last nightly backup". A failed run emails the owner through GitHub. Its Cloudflare token is scoped to D1 read/export only.
3. **D1 Time Travel**: free-plan retention to be verified and recorded here.

`scripts/setup-backup-key` (owner runs it) creates the `age` key pair, prints the private key once for the password manager and sets the recipient as a repo variable.

## Restore procedures _(to be completed by tasks 3.5, 3.6)_

### From a backup file

Settings → Backup → Restore, pick the file. The app validates version and schema and shows counts and the date range. Choose:

- **Add what's missing**: only records whose ids are not present.
- **Replace everything**: typed confirmation; a backup of the current state is saved first.

Restore writes locally and queues `mode: "restore"` batches, so it works on a clean install before or after sign-in, and ids (hence relationships) are preserved.

### From a nightly dump

1. Get the private `age` key from the password manager.
2. `scripts/restore-drill <dump.sql.age>` decrypts the dump, loads it into a fresh local D1 and compares record counts per entity.
3. To restore production: _(procedure to be written and rehearsed in task 3.6)_.

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
