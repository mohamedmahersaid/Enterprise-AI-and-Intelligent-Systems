# Changelog: AI Environment

Every change to the Claude Code environment of this repository: what, version,
why, how installed, how to roll back, and how it was validated.

## 2026-10-04: initial platform

| Component | Version / location | Reason | Method | Rollback | Validation |
| --- | --- | --- | --- | --- | --- |
| `CLAUDE.md` | repo root | Standing rules in ~590 tokens instead of re-reading CONTRIBUTING | file | delete | health check PASS (52 lines) |
| `.claude/settings.json` | repo | Read deny rules, force-push deny, ask rules for destructive actions, allowlist for gates, hook registration | file | delete or revert | parses; health check PASS |
| SessionStart hook `session-start.sh` | repo | CI-parity setup in web sessions: `npm ci`, Python 3.12 venv, `LEAF_PYTHON` | hook (sync) | remove entry + file | cold 8 s, warm under 1 s, no-op locally; shellcheck clean; `validate:python`/`validate:scripts` pass with it |
| PreToolUse hook `guard-derived.mjs` | repo | Block hand edits to wholly generated files | hook | remove entry + file | 10 cases checked by hand + unit test |
| Rules `leaves`, `workflows`, `validators` | `.claude/rules/` | Path-scoped detail, loaded on demand | files | delete | frontmatter checked by test |
| Skills `new-leaf`, `record-live-run`, `drive-pr`, `update-pin` | `.claude/skills/` | Repeated procedures from this repo's history | files | delete | frontmatter checked by test; `check-report.mjs` passes all 11 committed reports, fails on planted errors |
| Agents `leaf-reviewer`, `ci-investigator`, `source-verifier` | `.claude/agents/` | Keep wide reads out of the main context | files | delete | frontmatter checked by test |
| Site build excludes `.claude/` and `CLAUDE.md` | `scripts/build-site.mjs` | Tooling config must not become public reader pages (the build went 66 to 85 pages without it) | code | revert | back to 66 pages; check-site passes |
| `healthcheck.mjs` | `.claude/bin/` | PASS/WARN/FAIL/NOT CONFIGURED health report | file | delete | 16 PASS, 0 WARN, 0 FAIL, 5 NOT CONFIGURED |
| `test/claude-config.test.mjs` | `test/` | Keep hook, checker and config from rotting | file | delete | 4 tests pass in `npm test` |
| Platform docs | `.claude/platform/` | Audit, catalog, security, token rules, baseline, runbook | files | delete | markdownlint clean |

**Design correction during build:** a `Read(./site/**)` deny rule was dropped after it blocked shell inspection of the build output; Claude Code applies `Read` deny rules to shell reads too.

**Session-local only (not persisted):** actionlint 1.7.7 (`go install`) and
shellcheck 0.10.0 (`uv tool install shellcheck-py`), used to lint the workflows
and the startup hook. Persist via the environment setup script if wanted.

**Prepared, not installed:** four account skills (`architecture-decision-record`,
`incident-rca`, `azure-architecture-review`, `operational-runbook`) as upload
zips for claude.ai Settings, kept out of this public repository by the owner's
choice. The Azure review's pillar and design-area lists were checked against
Microsoft Learn on 2026-10-04.

**Not changed:** account connectors, account skills, the cloud environment, any
GitHub setting. No MCP server was added.
