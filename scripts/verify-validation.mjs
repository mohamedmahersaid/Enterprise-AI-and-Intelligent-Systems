/**
 * Confirms every run recorded in data/validation.json against the GitHub API.
 *
 * Offline, scripts/lib/readiness.mjs proves the record is well-formed and
 * agrees with its committed report; only the API can prove the run happened
 * as recorded. For each record this makes one unauthenticated GET of
 * /repos/{repo}/actions/runs/{run_id} and requires:
 *
 *   - conclusion "success"
 *   - the run's workflow path equals the recorded one, which must live under
 *     .github/workflows/
 *   - event schedule, workflow_dispatch or push - never pull_request, whose
 *     run executed the pull request's own live-run.mjs and spec, so its green
 *     run proves only that the pull request could print "pass"
 *   - head_branch main, and head_sha equal to the recorded head_sha
 *
 * It exits nonzero on any mismatch and prints why. It is plain node with no
 * dependencies and needs no token: the repository is public, so the CI job
 * that runs it can hold permissions: {} and no secret.
 *
 * Rate limits: unauthenticated api.github.com calls share a small per-address
 * quota, and hosted runners share addresses. On 403/429 the script retries up
 * to 3 times with backoff (honouring Retry-After when sent); if the limit
 * persists, the CLI exits 0 with a loud warning on pull_request events only,
 * and fails on push and schedule. The trade-off, deliberately: a bad record
 * could ride a rate-limited PR check, but the push run of this same script on
 * main (and the offline rules, which always run) still catch it, while PRs do
 * not go red for a quota nobody here controls.
 *
 * Usage: node scripts/verify-validation.mjs
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'mohamedmahersaid/Enterprise-AI-and-Intelligent-Systems';

/** Kept in step with RUN_EVENTS in scripts/lib/readiness.mjs. */
export const RUN_EVENTS = ['schedule', 'workflow_dispatch', 'push'];
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;

/** What the API's run must show for one record. Returns error strings. */
export function verifyRun(record, api) {
  const at = `run ${record.run_id} (${record.leaf})`;
  const errors = [];
  const want = (field, got, wanted, why = '') => {
    if (got !== wanted) errors.push(`${at}: ${field} is ${JSON.stringify(got)}, not ${JSON.stringify(wanted)}${why}.`);
  };
  want('conclusion', api.conclusion, 'success', ' - the run did not pass');
  if (!WORKFLOW.test(String(record.workflow ?? ''))) {
    errors.push(`${at}: recorded workflow "${record.workflow}" is not a file under .github/workflows/.`);
  }
  want('workflow path', api.path, record.workflow, ' - the run ran a different workflow than recorded');
  if (!RUN_EVENTS.includes(api.event)) {
    errors.push(
      `${at}: event "${api.event}" is not evidence - such a run executed unreviewed code; ` +
        `only ${RUN_EVENTS.join(', ')} count.`
    );
  }
  want('head_branch', api.head_branch, 'main', ' - only runs of the reviewed main branch count');
  want('head_sha', api.head_sha, record.head_sha, ' - the run built a different commit than recorded');
  want('run id', api.id, record.run_id);
  return errors;
}

/**
 * Verifies every record. `fetchFn` is injectable for tests; `delays` are the
 * backoff waits in ms between rate-limited retries. Returns errors (real
 * mismatches, which must always fail) apart from rateLimit (records the API
 * would not answer, which the CLI may tolerate on pull requests).
 */
export async function verifyValidation(validation, {
  fetchFn = fetch,
  repository = REPOSITORY,
  delays = [2000, 8000, 20000],
  log = (line) => console.error(line),
} = {}) {
  const errors = [];
  const rateLimit = [];
  for (const record of validation.runs ?? []) {
    const url = `https://api.github.com/repos/${repository}/actions/runs/${record.run_id}`;
    let res;
    for (let attempt = 0; ; attempt++) {
      res = await fetchFn(url, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'verify-validation' },
      });
      if ((res.status !== 403 && res.status !== 429) || attempt >= delays.length) break;
      const wait = Math.max(Number(res.headers?.get?.('retry-after')) * 1000 || 0, delays[attempt]);
      log(`${res.status} from ${url}; retry ${attempt + 1} of ${delays.length} in ${Math.round(wait / 1000)}s (rate limit)`);
      await new Promise((r) => setTimeout(r, wait));
    }
    if (res.status === 403 || res.status === 429) {
      rateLimit.push(`run ${record.run_id} (${record.leaf}): still ${res.status} after ${delays.length} retries - API rate limit.`);
      continue;
    }
    if (!res.ok) {
      errors.push(`run ${record.run_id} (${record.leaf}): GET ${url} returned ${res.status} - no such run in ${repository}.`);
      continue;
    }
    errors.push(...verifyRun(record, await res.json()));
  }
  return { errors, rateLimit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const validation = JSON.parse(fs.readFileSync('data/validation.json', 'utf8'));
  const { errors, rateLimit } = await verifyValidation(validation);
  for (const e of errors) console.error(`verify-validation: ${e}`);
  if (errors.length) process.exit(1);
  if (rateLimit.length) {
    for (const e of rateLimit) console.error(`verify-validation: ${e}`);
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
      // Loud, not red: see the rate-limit trade-off in the header comment.
      console.error('::warning title=verify-validation::Could not verify data/validation.json against the GitHub API (rate limited after retries). NOT verified - the push run on main will verify it.');
      process.exit(0);
    }
    process.exit(1);
  }
  console.log(`verify-validation: ${(validation.runs ?? []).length} record(s) verified against the GitHub API.`);
}
