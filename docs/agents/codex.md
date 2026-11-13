# Delegating to Codex

The orchestrator (Claude) writes briefs, runs Codex through `scripts/agent/codex-run`, verifies independently, commits and merges. A Codex report is a claim, not verification.

This method comes from `temple_inventory` (`~/code/frappe_docker_wsl/development/frappe-bench/apps/temple_inventory`, `scripts/codex-run`, `docs/agents/codex.md`), with these changes:

| Weakness observed there                                                                                    | Change for Hourtrail                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All tasks share one working tree and Codex cannot commit, so parallel work is separated only by convention | One **git worktree and branch per task** (`.worktrees/NAME`, branch `task/NAME`). The orchestrator commits in the worktree after verifying, rebases on `main`, fast-forward merges and removes the worktree.                                                                    |
| The final report is free prose                                                                             | `--output-schema scripts/agent/report.schema.json`, so the final message is JSON: `status` (`done`/`partial`/`blocked`), `summary`, `files_changed`, `checks[{command, result, detail}]`, `tests_added`, `deviations`, `assumptions`, `questions`, `docs_notes`, `screenshots`. |
| Session id is grepped from a multi-megabyte log                                                            | `--json` event stream to `events.jsonl`; the session id comes from its `thread.started` event. Parse with `node` (there is no `jq`).                                                                                                                                            |
| A separate watcher must be re-armed every 20 minutes                                                       | The runner has its own watchdog over the whole run (see "Never silent" below). Launch it with Bash `run_in_background`; the harness notifies on exit. Never a plain `&`, never polling.                                                                                         |
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
                        [--resume SESSION | --fork SESSION] [--timeout T] [--stall T]
                        [--progress T] [--install-timeout T] [--deadline T]
                        [--fast] [--force-model]          (T = minutes, or Ns for seconds)
```

1. Check the usage budget, then create `.agent-runs/NAME/` with `pid`, `phase` and `meta` at once (so `status` sees the run from its first second), copy the brief in, and arm the outer deadline.
2. Create `.worktrees/NAME` on `task/NAME` from `main` (reuse it on resume) and install dependencies under `--install-timeout` (default 10 min).
3. Assign a port block (`HT_PORT_BASE`) and run `codex exec [resume|fork SESSION] --json -C <worktree> -m <model> -c model_reasoning_effort=… [-c service_tier="fast" with --fast] -c sandbox_mode="workspace-write" -c approval_policy="never" -c sandbox_workspace_write.network_access=true -c sandbox_workspace_write.writable_roots=[…] --output-schema scripts/agent/report.schema.json -o .agent-runs/NAME/report.json -` with the brief on stdin, in a minimal environment.
4. Watch it (below), then write `exit`, `exit-reason`, `session` and `summary.txt`, and print the summary.

### Never silent

Every path out of the runner goes through one `finish` function behind `ERR`, `INT`, `TERM`, `HUP` and `EXIT` traps, so a setup error, an install hang, a crash in the summary step or a signal still leaves `exit` (a code), `exit-reason` (one line) and `summary.txt`, and the runner exits. Only SIGKILL (a crash or a machine restart) can bypass the traps; `status` catches that case.

| Exit      | Meaning                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0         | Codex finished                                                                                                                                                                             |
| 1–99      | Codex itself exited with that code (the reason quotes its last stderr line)                                                                                                                |
| 119       | Busy without progress: Codex kept emitting events but the worktree diff did not change for 2 × `--progress` (a warning is written to `summary.txt` after 1 × `--progress`; default 30 min) |
| 120       | Died: the runner disappeared without an exit record; written later by `status`                                                                                                             |
| 121       | Setup error (the reason names the phase, line and command)                                                                                                                                 |
| 122 / 123 | Dependency install failed / timed out                                                                                                                                                      |
| 124       | Codex run exceeded `--timeout` (default 75 min)                                                                                                                                            |
| 125       | Stalled: no Codex event, no heavy-lock heartbeat and no worktree change for `--stall` (default 12 min)                                                                                     |
| 126       | The whole runner exceeded `--deadline` (default `--timeout` + 20 min)                                                                                                                      |
| 128 + N   | Killed by signal N (129 HUP, 130 INT, 143 TERM)                                                                                                                                            |

**Heavy-lock waits are alive, not stalls.** `scripts/heavy` writes `$HT_RUN_DIR/heavy-wait` (and `/tmp/hourtrail-heavy.waiting.d/<pid>`) every 30 s while waiting, with the waiting command and the holder, and `$HT_RUN_DIR/heavy-run` while it holds the lock; `<lock>.holder` names the current holder. The stall timer treats a fresh heartbeat as a sign of life and the progress timer pauses while it is fresh, so `--stall` can stay short: a run is only killed when nothing at all happens.

**Verify and land never hang.** `scripts/agent/verify` gives each step a limit (install 10, format 5, lint 10, types 10, unit tests 15, baseline 20, build 20 and E2E 40 min, including any heavy-lock wait; override with `HT_VERIFY_<STEP>_S`) and the whole run 75 min; `scripts/agent/land` limits rebase, install, check, E2E and push, and the whole run to 60 min (`HT_LAND_<STEP>_S`, `HT_LAND_DEADLINE_S`). A timeout prints `TIMEOUT: <step>` and exits non-zero.

### Status, liveness and recovery

- **No hand-written wait loops.** Waiting is `watch-runs` or the runner's own exit notification. A hand-rolled `until … ! pgrep -f "codex-run NAME"; do sleep 20; done` never ends, because `pgrep -f` matches the loop's own shell, whose command line contains the pattern (one ran for over six hours after its run finished).
- **No untracked launches.** Every runner, verify, land or wait goes through Bash `run_in_background`, never a plain `&` (an `&` launch once left a land and a Codex run that the harness could not report on).
- **`scripts/agent/status` first, every time you wake up**, including from cache-warm and liveness timers. It lists every run as running (live pid), finished (exit code and reason) or died, with age, last event, model, phase and whether it is waiting on or holding the heavy lock, flags stalled or overdue runs, and exits 3 when anything needs attention. A died run (pid gone, no `exit`) gets `exit` 120 and an `exit-reason`, and is appended to `.agent-runs/resume-queue` as `--resume SESSION` (or `relaunch` when it never got a session): resume or relaunch it, then delete its queue line.
- **Liveness timer.** Whenever runs are in flight, keep `scripts/agent/watch-runs` running in the background (`run_in_background`). It checks `status` every minute and exits, waking you, as soon as a run dies, stalls or overruns (exit 3), when no runs remain (exit 0), or after 30 minutes (exit 0: re-arm it). Re-arm it until no runs remain.
- **Self-test.** `scripts/agent/selftest` demonstrates each failure mode with a fake codex (`scripts/agent/lib/fake-codex`, selected through `HT_CODEX_BIN`) in about two minutes, on its own heavy lock. Run it after any change to the runner, `heavy`, `status` or `watch-runs`.

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
2. On waking (a notification, a timer, a restart): run `scripts/agent/status` and deal with died, stalled or queued runs before anything else.
3. Run `scripts/agent/codex-usage`, choose the model, launch the runner with `run_in_background` (never `&`), and make sure `scripts/agent/watch-runs` is armed. Carry on with other work.
4. When notified, read `summary.txt` and `report.json`. Read `events.jsonl` only to diagnose a failure.
5. Verify in the worktree: `scripts/agent/verify NAME` (format, lint, types, unit tests, build, E2E when the task touches UI or sync, all under `scripts/heavy`); read the whole diff against the brief and SPEC; compare test edits with intent (Codex has weakened assertions before); open every screenshot and check real data, Chinese text, both themes and 390 px width. A blank or loading screenshot is a failure.
6. Treat any report line like "a test failed once and did not reproduce" as a bug report: rerun that suite repeatedly until it fails and fix the cause (a flaky property test found a real `z.json()` data-loss bug).
7. Fix rounds: trivial fixes yourself; after any fix of your own, rerun `pnpm check` before committing (a review fix once broke lint on `main`); substantive ones go back with `--resume SESSION` and a short fix brief (`--fork` if resume reports an active writer). After two rounds, take it over.
8. Squash with `scripts/agent/squash NAME MESSAGE_FILE` (commits relative to the task's own base: a `git reset --soft main` in a stale worktree once reverted other merged work), then land it with `scripts/agent/land NAME [--extra GLOB]` (refuses paths outside the brief's `owned` globs unless allowed with `--extra`), which rebases on `main`, refuses to merge unless `pnpm check` passes, fast-forwards, pushes and removes the worktree (a hand-written command chain once merged past a failing check). Update `docs/PROGRESS.md`, and add a changelog line to `UI_UX_DECISIONS.md` when behaviour changed.

Screenshots need a Chinese font: Noto Sans CJK SC in `~/.local/share/fonts` (no sudo needed).

## Smoke-run findings

Smoke-tested on 2026-11-12 with `codex-cli 0.166.0`, `gpt-6-luna` at low effort in fast mode, before fast mode was turned off by default (a trivial function plus test, then one `--resume` fix round). About 1% of the 5-hour window for both rounds together; each round took under a minute.

- `--json` writes one JSON object per line: `thread.started` (with `thread_id`, the session id), `turn.started`, `item.started`/`item.completed` (agent messages, commands, file changes), `turn.completed` (with token usage). No rate-limit data appears in the stream; `codex-usage` reads it from `~/.codex/sessions` instead.
- `--output-schema` works for new runs **and on `exec resume`**: `report.json` was valid JSON matching the schema both times. The prose fallback was not needed.
- `exec resume` and `exec fork` do not accept `-C`; the runner starts them with the worktree as the working directory, which works.
- On resume the runner moves the previous round's files to `round-N/` and keeps `brief.orig.md`, so `summary.txt` still checks scope against the original `owned` globs when the fix brief has no front matter.
- `verify NAME` builds a `main` baseline of test counts once per `main` commit (in a temporary detached worktree) and fails when a task has fewer tests or more skipped tests than `main`.
- Unit tests run **outside** the heavy lock. During bootstrap the shared lock was held for over ten minutes by a `temple_inventory` browser run; Hourtrail's Vitest suites are light. Builds, E2E and screenshots still take the lock.
