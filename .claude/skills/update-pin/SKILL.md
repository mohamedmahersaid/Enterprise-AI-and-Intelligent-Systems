---
name: update-pin
description: Change a pinned version (hosted model, Azure api-version, npx package, Python or npm package, Ollama tag) everywhere it appears and in the registries that track it, in one PR. Use when the weekly currency or tags check fails, or a pin needs bumping.
argument-hint: "<what> <old> <new>"
---

# Update a pin

Change: `$ARGUMENTS`.

1. **Verify the new value at its source** - Microsoft Learn MCP for Azure models
   and api-versions (retirement schedule, API version pages), `https://pypi.org/pypi/<pkg>/json`
   or `https://registry.npmjs.org/<pkg>/latest` for packages. Note the source URL.
2. **Find every occurrence** - `rg -n --fixed-strings '<old>' docs data scripts .github`.
   Leaves, `data/currency.json`, `data/live/*.json`, `scripts/requirements*.txt`,
   workflows and fixtures can all carry it.
3. **Change all of them together.** Python lockfiles are compiled with hashes:
   regenerate `scripts/requirements*.txt` from their `.in` with the tool named in
   the file header, never by hand. In `data/currency.json` update the entry and
   move `review_by` forward with the source you read.
4. **Regenerate and check** - `npm run regen` (ASSUMPTIONS.md lists pins), then
   `npm run validate`; for currency entries also `node scripts/check-currency.mjs`.
5. A pin a major behind that is held deliberately (mermaid 11.x) is annotated,
   not failed: leave it unless asked, and say so.
6. Ship with `/drive-pr`. If a validated leaf's commands changed, its evidence no
   longer covers the new text - say so in the PR and plan a fresh live run.
