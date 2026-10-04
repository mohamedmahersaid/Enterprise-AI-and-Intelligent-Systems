---
paths:
  - "scripts/**"
  - "test/**"
---

# Validator rules

- Plain Node 22 ES modules, no new runtime dependencies without a reason in the PR.
- Keep logic in pure exported functions (`scripts/lib/*.mjs`) and test them with
  `node --test` fixtures in `test/`; the CLI wrapper only gathers input and prints.
- A new gate must be added to the `validate` script exactly once (a test asserts
  this) and to `.github/workflows/validate.yml`.
- Validators read and report; they never write to the tree. Only `regenerate.mjs`
  and `new-leaf.mjs` write.
- Network calls belong in scheduled workflows (links, currency, tags), never in
  the offline gates, and must tolerate registry outages explicitly.
- Run `npm test` after any change here; `npm run validate` before pushing.
