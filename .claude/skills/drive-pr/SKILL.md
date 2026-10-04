---
name: drive-pr
description: Take committed work on the session branch to a merged, verified PR in this repo - gates, push, draft PR, CI watch, merge on green, clean-worktree verification of main, branch sync. Use when work is ready to ship or a PR needs driving to green.
argument-hint: "[pr-number]"
---

# Drive a PR to merge

PR (if it exists): `$ARGUMENTS`. One purpose per PR.

## Before pushing

1. `npm test` and `npm run validate` locally (web sessions have `LEAF_PYTHON`
   from the startup hook). For workflow edits also `actionlint` if installed.
2. Re-read the diff as a reviewer would; stage by explicit path, never `git add -A`.
3. Commit message: what and why, then the session's attribution trailers.

## Ship

1. `git push -u origin <session branch>` (retry only on network errors).
2. No open PR for the branch: create one as **draft** with a body that mirrors
   what changed and how it was verified. Subscribe to its activity.
3. CI red: root-cause from `mcp__github__get_job_logs`; fix and push. Never skip
   or disable a test, never an empty commit to re-trigger.
4. CI green and the user's go-ahead (or a standing instruction) to merge:
   mark ready (`draft: false`), squash-merge with the title plus `(#N)` and
   `expectedHeadSha` set to the tested head.

## After merge

```bash
git fetch -q origin main
W=$(mktemp -d) && git worktree add -q --detach "$W" origin/main
(cd "$W" && npm ci --silent && npm test && npm run validate && npm run regen && git status --short)
git worktree remove --force "$W"
```

`git status --short` must print nothing (regen is clean). Then bring the
session branch level with `main` without rewriting history:
`git merge -s ours origin/main -m "Merge origin/main after #N"` and push.
Unsubscribe from the PR and cancel any pending check-in.
