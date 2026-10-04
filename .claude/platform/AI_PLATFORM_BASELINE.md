# AI Platform Baseline

Measurements taken 2026-10-04 in a Claude Code on the web container
(Claude Code 2.1.289, Node 22.22.2, 4 vCPU). Token figures are estimates at
4 characters per token; tool counts are from the session's tool list. Use them
as a reference point for later changes, not as precise accounting.

## Standing context (paid every session)

| Item | Before | After |
| --- | --- | --- |
| Project instructions | none; rules re-derived from CONTRIBUTING.md (~5,900 tokens when read) | `CLAUDE.md` 52 lines, ~590 tokens |
| Skill and agent descriptions (repo) | 0 | ~450 tokens (4 skills, 3 agents) |
| Attached MCP tools | ~159 | ~159; ~93 if the owner disables the four non-development connectors |

## On-demand context

| Item | Tokens (approx.) | Loads when |
| --- | --- | --- |
| `rules/leaves.md` | 455 | a `docs/`, catalog or live-spec file is read |
| `rules/workflows.md` | 241 | a workflow file is read |
| `rules/validators.md` | 194 | a `scripts/` or `test/` file is read |
| Skills | 396-774 each | invoked |
| Agents | 364-509 each | delegated to (in the agent's own context) |

## Startup and operations

| Operation | Measured |
| --- | --- |
| SessionStart hook, cold (npm ci + venv + hashed pip install) | 8 s |
| SessionStart hook, warm (stamps current) | under 1 s |
| SessionStart hook, non-web session | no-op |
| Health check, offline | 0.15 s |
| `npm test` (170 tests) | about 11 s |

## Repeated workflows (before, from this repository's history)

| Workflow | Before | After |
| --- | --- | --- |
| Record a live run | Hand transcription of each job log, no slip detection, procedure restated each time | `/record-live-run` + `check-report.mjs` (all 11 committed reports verified) |
| Python 3.12 parity | Manual PATH shim recreated per container | `LEAF_PYTHON` exported by the startup hook |
| Hand edit to a generated file | Caught by `validate:regen` in CI | Blocked at edit time |
| Workflow lint | None locally | `actionlint` + `shellcheck` (session-local; setup script to persist) |

## How to re-measure

```bash
node .claude/bin/healthcheck.mjs
wc -l CLAUDE.md && wc -c CLAUDE.md .claude/rules/*.md .claude/skills/*/SKILL.md .claude/agents/*.md
time npm test
```
