---
name: record-live-run
description: Record a passing live.yml run as readiness evidence - transcribe each leaf leg's printed report into data/live/runs/, append data/validation.json records, and promote the leaves to validated. Use when asked to record, collect or promote from a live run id.
argument-hint: "<run_id> [leaf ...]"
---

# Record a live run

Run: `$ARGUMENTS`. Only a run on `main` with event `workflow_dispatch`,
`schedule` or `push` counts; a `pull_request` run executed the PR's own spec and
is never evidence (`verify-validation` rejects it).

## 1. Confirm the run

`gh api repos/{owner}/{repo}/actions/runs/<run_id>` (or `mcp__github__actions_get`):
note `event`, `head_branch`, `head_sha`, `conclusion`. Stop if it is not
`success` on `main`. List jobs with `mcp__github__actions_list`
(`list_workflow_jobs`); each leaf is one job named after it.

## 2. Transcribe each leg

Job logs and artifacts live on a blob host this environment cannot reach, so
`gh api .../logs` is refused. Use `mcp__github__get_job_logs` with
`return_content: true` and `tail_lines` around 260, and take:

- the JSON printed by the "Print the run report" step (after its `##[endgroup]`),
  timestamps stripped;
- `SHA256 digest of uploaded artifact is <sha>` from the upload step.

Write `data/live/runs/<leaf>-<run_id>.json`: a `$comment` first, then the
printed fields in printed order. `$comment` template:

```text
The trimmed live-run report backing the data/validation.json record for run
<run_id>, as the run's 'Print the run report' step printed it (each step's
output kept to its last lines); the same content was uploaded as the
live-run-<leaf> artifact, sha256 <sha>.
```

(one line in the JSON string; the line breaks here are for reading)

If the log shows `***`, Actions masking replaced text (e.g. `Bearer $KEY`):
keep `***` in `text`/`ran` and add a sentence saying which Commands were masked.
Write JSON with 2-space indent, non-ASCII kept literal and control characters
escaped as `\u001b` (jq's style); generate it with a script, never by retyping
long outputs.

Then check it - this catches any transcription slip:

```bash
node .claude/skills/record-live-run/check-report.mjs data/live/runs/<leaf>-<run_id>.json
```

## 3. Record and promote

1. Append one record per leaf to `data/validation.json` `runs`: `leaf`, `date`
   (the run date, never later than today), `workflow` (`.github/workflows/live.yml`),
   `run` (full run URL), `run_id`, `head_sha`, `event`, `head_branch`,
   `environment` (runner image, tool versions, `repository at <sha7>`),
   `covered` (`Commands 1, 2, ... run as data/live/<leaf>.json describes: ...`),
   `result: "pass"`. Copy the shape of the last existing record.
2. Set `readiness` to `validated` in `data/catalog.json` and the leaf frontmatter,
   and replace the `**Readiness:**` line with:
   `**Readiness:** [Validated](../../../READINESS.md#validated) - run live on <date> ([evidence](<run URL>)).`
3. `npm run regen`, then `npm run validate` (it re-checks record against report).
4. Commit by explicit paths; open the PR with `/drive-pr`. CI's
   `verify-validation` confirms the run against the GitHub API.
