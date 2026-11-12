# Delegating to Codex

The orchestrator (Claude) writes briefs, runs Codex through `scripts/agent/codex-run`, verifies independently, commits and merges. A Codex report is a claim, not verification.

This method comes from `temple_inventory` (`~/code/frappe_docker_wsl/development/frappe-bench/apps/temple_inventory`, `scripts/codex-run`, `docs/agents/codex.md`), with these changes:

| Weakness observed there                                                                                    | Change for Hourtrail                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All tasks share one working tree and Codex cannot commit, so parallel work is separated only by convention | One **git worktree and branch per task** (`.worktrees/NAME`, branch `task/NAME`). The orchestrator commits in the worktree after verifying, rebases on `main`, fast-forward merges and removes the worktree.                                                                    |
| The final report is free prose                                                                             | `--output-schema scripts/agent/report.schema.json`, so the final message is JSON: `status` (`done`/`partial`/`blocked`), `summary`, `files_changed`, `checks[{command, result, detail}]`, `tests_added`, `deviations`, `assumptions`, `questions`, `docs_notes`, `screenshots`. |
| Session id is grepped from a multi-megabyte log                                                            | `--json` event stream to `events.jsonl`; the session id comes from its `thread.started` event. Parse with `node` (there is no `jq`).                                                                                                                                            |
| A separate watcher must be re-armed every 20 minutes                                                       | The runner has its own watchdog: exit 124 after `--timeout` minutes (default 75), 125 after `--stall` minutes without an event (default 15). Launch it with Bash `run_in_background`; the harness notifies on exit. Do not poll and do not arm a Monitor.                       |
| Scope and test integrity are checked by eye                                                                | The runner writes `summary.txt`: report status, changed paths, any path **outside the brief's `owned` globs**, diffstat and test cases removed or skipped. `scripts/agent/verify NAME` runs the checks and compares test counts with `main`.                                    |
| Runs live in `/tmp/codex-runs`, shared and lost on reboot                                                  | `.agent-runs/NAME/` in the repo, gitignored: `brief.md`, `events.jsonl`, `report.json`, `summary.txt`, `session`, `exit`, `shots/`.                                                                                                                                             |
| Codex has no way to ask a question                                                                         | The brief tells it to stop with `status: "blocked"` and `questions` when a decision is missing. Answer with `--resume`.                                                                                                                                                         |
| Heavy commands from parallel tasks compete for 13 GB RAM                                                   | `scripts/heavy` serialises builds, E2E and screenshots across all Hourtrail worktrees with its own lock, `/tmp/hourtrail-heavy.lock`. It is deliberately **not** shared with `temple_inventory` (owner decision, 2026-11-12); watch `free -g` instead.                          |
| Secrets could leak into an agent's environment                                                             | The runner starts Codex with a minimal environment (PATH, HOME, locale, `HT_PORT_BASE`) and never passes Cloudflare or GitHub credentials. Only the orchestrator deploys.                                                                                                       |

## Usage budget (shared account)

The Codex account is shared with the `temple_inventory` orchestrator, which also runs Codex agents. Sol uses the 5-hour window much faster than Luna, so model choice depends on how much of the window is left and when it resets.

`scripts/agent/codex-usage` reads the newest `rate_limits` event from any Codex session under `~/.codex/sessions` (both projects write there) and prints the 5-hour and weekly windows, their reset times, active Codex processes and a recommendation. A window whose reset time has passed counts as empty. `codex-run` prints it at launch and applies the policy:

| 5-hour window                                         | Weekly window | Sol-routed task runs on                                      | Luna-routed task runs on |
| ----------------------------------------------------- | ------------- | ------------------------------------------------------------ | ------------------------ |
| ≥ 50% left, or ≥ 25% left and it resets within 60 min | < 80% used    | Sol                                                          | Luna                     |
| Otherwise, ≥ 15% left                                 | any           | Luna high (note the downgrade in PROGRESS and review harder) | Luna                     |
| < 15% left                                            | any           | Hold: wait for the reset (owner preference)                  | Hold: wait for the reset |

- `codex-run --model gpt-6.1-sol` refuses when the policy says Luna, unless `--force-model` is given. Use that only for a task that has already failed on Luna.
- **When the window runs out, continue with Claude Haiku subagents** (owner decision, 2026-11-12, replacing "wait for the reset"). See "Haiku fallback" below. Keep the orchestrator's prompt cache warm during any wait: a background `sleep 3300` timer wakes you at least every 55 minutes.
- Run at most one Sol task at a time. Check usage before each batch of launches, not only the first.
- `codex exec review` second opinions (auth, sync, time, migrations) count against the same window: use Sol for them only when the policy allows Sol, otherwise Luna high.

## Haiku fallback

When `codex-usage` says `hold`, run queued tasks as Claude Haiku subagents instead of waiting:

1. Create the worktree and run directory as `codex-run` would: `git worktree add -b task/NAME .worktrees/NAME main`, `pnpm install --frozen-lockfile --prefer-offline` there, copy the brief to `.agent-runs/NAME/brief.md` and `brief.orig.md`, pick an unused `HT_PORT_BASE`.
2. Spawn the Agent tool with `model: "haiku"` (general-purpose), `run_in_background`, and a prompt that is the brief plus: work only in `.worktrees/NAME`, export `HT_PORT_BASE` and `HT_RUN_DIR` for every command, put screenshots in `.agent-runs/NAME/shots/`, do not commit, and end with the report JSON (same fields as `report.schema.json`), also written to `.agent-runs/NAME/report.json`.
3. When it finishes, run `node scripts/agent/lib/summarize.mjs NAME > .agent-runs/NAME/summary.txt` and verify exactly as for Codex. Haiku is weaker than Luna: prefer it for scoped UI, wiring and test tasks, read the diff more closely, and send fix rounds back to the same agent (SendMessage) before taking over.
4. Sol-tier logic (`packages/core`, sync, auth) may wait for the reset when it is under an hour away; otherwise brief Haiku with the contract and review twice as hard. Record the model used in PROGRESS.

## Fast mode

Runs do **not** use fast mode by default (owner preference, 2026-11-12). `--fast` adds `-c service_tier="fast"`, which trades more usage for speed; use it only when the owner asks. Always pass model and effort explicitly: `~/.codex/config.toml` defaults to `gpt-6.1-sol` at low effort.

## `scripts/agent/codex-run`

```
scripts/agent/codex-run NAME BRIEF [--model M] [--effort low|medium|high|xhigh]
                        [--resume SESSION | --fork SESSION] [--timeout MIN] [--stall MIN]
                        [--fast] [--force-model]
```

1. Create `.worktrees/NAME` on `task/NAME` from `main` (reuse it on resume) and run `pnpm install --frozen-lockfile --prefer-offline` there.
2. Create `.agent-runs/NAME/` (in the main checkout), copy the brief in, and assign a port block (`HT_PORT_BASE`) so dev servers and Playwright runs do not collide.
3. Run `codex exec [resume|fork SESSION] --json -C <worktree> -m <model> -c model_reasoning_effort=… [-c service_tier="fast" with --fast] -c sandbox_mode="workspace-write" -c approval_policy="never" -c sandbox_workspace_write.network_access=true -c sandbox_workspace_write.writable_roots=[…] --output-schema scripts/agent/report.schema.json -o .agent-runs/NAME/report.json -` with the brief on stdin.
4. Watchdog as above; write `exit` and `session`.
5. Write and print `summary.txt`.

Smoke-run findings (task 0.2) are recorded at the end of this document.

## Briefs

Use `scripts/agent/brief-template.md`. Front matter: `owned` (globs Codex may edit), `read_only` (paths it must not touch), `checks` (exact commands that must pass). Body, in order: goal in two sentences; context with `file:line` pointers and the SPEC or DESIGN_SYSTEM sections that apply; the contract to honour (types and signatures, copied in); acceptance criteria as observable behaviour; evidence required (tests to add, screenshots into `.agent-runs/NAME/shots/`); out of scope; stop and report `blocked` instead of guessing; no new dependencies unless listed; do not commit.

Size: one coherent change reviewable in one sitting (roughly up to 600 changed lines). Split anything larger.

## Model routing

| Work                                                                                                                                      | Default model and effort                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped UI, CRUD screens, wiring, exports, test writing                                                                                    | `gpt-6-luna`, medium                                                                                                                                                                                             |
| Multi-file UI flows with state (Home, session editor, History, review, reports)                                                           | `gpt-6-luna`, high                                                                                                                                                                                               |
| `packages/core` logic, the repository and outbox layer, sync client and server, auth, service worker and updates, Web Push, backup format | `gpt-6.1-sol`, high, subject to the usage policy                                                                                                                                                                 |
| Second-opinion review of auth, sync, time and migration changes                                                                           | `codex exec review --base main` in the worktree (model per the usage policy), in addition to your own review                                                                                                     |
| A task that still fails after two fix rounds                                                                                              | Stop sending it back. Implement it yourself in the worktree, or hand it to a Claude subagent (Sonnet for scoped work, Opus for hard logic) with the brief, the diff so far and what failed. Never `gpt-6-astra`. |

**How many at once.** Worktrees and the heavy lock make parallel runs safe. Limits are disjoint `owned` globs, verification speed and the shared usage window. Working rule: two or three scoped UI tasks together, `packages/core` and sync tasks one at a time (others depend on their interfaces), one Sol task at a time, fewer when `free -g` shows under 4 GB available or `temple_inventory` runs are active (`codex-usage` lists running Codex processes).

## Loop for each task

1. Write the brief. For tasks that share an interface, land the types in `packages/core` first, then run consumers in parallel with disjoint `owned` globs. Only one running task may add dependencies (lockfile).
2. Run `scripts/agent/codex-usage`, choose the model, launch the runner with `run_in_background`. Carry on with other work.
3. When notified, read `summary.txt` and `report.json`. Read `events.jsonl` only to diagnose a failure.
4. Verify in the worktree: `scripts/agent/verify NAME` (format, lint, types, unit tests, build, E2E when the task touches UI or sync, all under `scripts/heavy`); read the whole diff against the brief and SPEC; compare test edits with intent (Codex has weakened assertions before); open every screenshot and check real data, Chinese text, both themes and 390 px width. A blank or loading screenshot is a failure.
5. Fix rounds: trivial fixes yourself; after any fix of your own, rerun `pnpm check` before committing (a review fix once broke lint on `main`); substantive ones go back with `--resume SESSION` and a short fix brief (`--fork` if resume reports an active writer). After two rounds, take it over.
6. Commit in the worktree (Conventional Commit with a why-body), rebase on `main`, fast-forward merge, push, remove the worktree, update `docs/PROGRESS.md`, and add a changelog line to `UI_UX_DECISIONS.md` when behaviour changed.

Screenshots need a Chinese font: Noto Sans CJK SC in `~/.local/share/fonts` (no sudo needed).

## Smoke-run findings

Smoke-tested on 2026-11-12 with `codex-cli 0.166.0`, `gpt-6-luna` at low effort in fast mode, before fast mode was turned off by default (a trivial function plus test, then one `--resume` fix round). About 1% of the 5-hour window for both rounds together; each round took under a minute.

- `--json` writes one JSON object per line: `thread.started` (with `thread_id`, the session id), `turn.started`, `item.started`/`item.completed` (agent messages, commands, file changes), `turn.completed` (with token usage). No rate-limit data appears in the stream; `codex-usage` reads it from `~/.codex/sessions` instead.
- `--output-schema` works for new runs **and on `exec resume`**: `report.json` was valid JSON matching the schema both times. The prose fallback was not needed.
- `exec resume` and `exec fork` do not accept `-C`; the runner starts them with the worktree as the working directory, which works.
- On resume the runner moves the previous round's files to `round-N/` and keeps `brief.orig.md`, so `summary.txt` still checks scope against the original `owned` globs when the fix brief has no front matter.
- `verify NAME` builds a `main` baseline of test counts once per `main` commit (in a temporary detached worktree) and fails when a task has fewer tests or more skipped tests than `main`.
- Unit tests run **outside** the heavy lock. During bootstrap the shared lock was held for over ten minutes by a `temple_inventory` browser run; Hourtrail's Vitest suites are light. Builds, E2E and screenshots still take the lock.
