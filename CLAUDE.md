# CLAUDE.md

An enterprise AI engineering curriculum: 38 leaves under `docs/`, a site
generated from them, and the Node validators that keep both honest. Rules for
humans live in [CONTRIBUTING.md](CONTRIBUTING.md); this file is the short
version for Claude, and path-scoped detail loads from `.claude/rules/` only
when matching files are touched.

## Source of truth

- `data/catalog.json` drives navigation. `PATHS.md`, `READINESS.md`,
  `ASSUMPTIONS.md` and branch READMEs are generated whole (a hook blocks hand
  edits); `CATALOG.md`, tree READMEs and `README.md` keep hand-written prose
  around generated lists. After any catalog or leaf change: `npm run regen`.
- `data/validation.json` + `data/live/runs/*.json` back every `validated`
  readiness claim. Never promote a leaf without a recorded, passing run.
- `data/certifications.json` and `data/currency.json` are hand-reviewed
  registries; each entry cites its source.

## Gates (run before every push)

```bash
npm test                 # validator unit tests
npm run validate         # every gate, in CI order (includes test, lint, site build)
```

Web sessions get `node_modules` and a Python 3.12 leaf venv (`LEAF_PYTHON`)
from `.claude/hooks/session-start.sh`. Elsewhere, set `LEAF_PYTHON` to a 3.12
interpreter before `validate:python` / `validate:scripts`.

## Non-negotiables

- No invented facts: versions, benchmarks, exam codes and references must be
  verifiable; write "not verified" when they are not.
- Never commit real credentials, internal URLs, customer data or
  employer-confidential material; never print environment secret values.
- Workflows: actions pinned to a commit SHA, least-privilege `permissions`,
  no secrets in jobs that run repository code.
- One purpose per PR. Draft first, CI green, then merge; verify `main` from a
  clean worktree afterwards.

## Where things are

| Need | Go to |
| --- | --- |
| Write or revise a leaf | `/new-leaf` skill, `.claude/rules/leaves.md` |
| Record a live run as evidence | `/record-live-run` skill |
| Drive a PR to merge | `/drive-pr` skill |
| Update a pinned version | `/update-pin` skill |
| Review a leaf, diagnose CI, verify sources | `leaf-reviewer`, `ci-investigator`, `source-verifier` agents |
| Environment health | `node .claude/bin/healthcheck.mjs` |
| Platform design and runbook | `.claude/platform/` |
