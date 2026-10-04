---
paths:
  - ".github/workflows/**"
  - ".github/dependabot.yml"
---

# GitHub Actions rules

- Pin every action to a full commit SHA with a trailing `# vX.Y.Z` comment.
- Top-level `permissions: contents: read`; grant more per job, only where needed.
  A job that runs repository or leaf code never holds a write token or a secret;
  writing (issues, Pages) happens in a separate job (see `live.yml`, `currency.yml`).
- `actions/checkout` with `persist-credentials: false`.
- Untrusted or variable values reach shell through `env:`, never `${{ }}`
  interpolated into `run:`. The runner echoes a step's evaluated `env` in the
  log, and logs here are public: never pass `toJSON(vars)` or secret material.
- Set `timeout-minutes` on every job.
- Lint before pushing when available: `actionlint` (with `shellcheck`).
- A workflow that needs a path list (e.g. `live.yml` `pull_request.paths`) must
  stay in step with the specs; `validate:content` checks `live.yml`.
