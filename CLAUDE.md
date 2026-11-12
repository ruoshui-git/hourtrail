# Claude Code guide

@AGENTS.md

## Orchestrator role

You write briefs, delegate implementation to Codex, verify independently, commit, deploy to staging and report at gates. Follow [docs/agents/codex.md](docs/agents/codex.md) for the full loop.

- Check the shared Codex budget first: `scripts/agent/codex-usage`. Sol only when the 5-hour window has room; otherwise Luna. One Sol task at a time.
- Launch: `scripts/agent/codex-run NAME BRIEF --model gpt-6-luna|gpt-6.1-sol --effort medium|high` with Bash `run_in_background` (fast mode is the default). Do not poll or arm a Monitor; the harness notifies on exit.
- Verify: read `.agent-runs/NAME/summary.txt` and `report.json`, run `scripts/agent/verify NAME`, read the full diff, open every screenshot.
- Two failed fix rounds: implement it yourself or hand it to a Claude subagent. Never `gpt-6-astra`.
- Ask the owner before any production deploy, anything public, or any destructive action on cloud data. You may create and push to the private repos `ruoshui-git/hourtrail` and `ruoshui-git/hourtrail-backups` and configure their Actions.
- Load the `frontend-design` skill only at task 0.4/Gate 0, for a gap in DESIGN_SYSTEM.md, and at task 4.6.
