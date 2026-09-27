import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyRun, verifyValidation } from '../scripts/verify-validation.mjs';

const SHA = 'f'.repeat(40);
const record = (over = {}) => ({
  leaf: 'leaf-a',
  workflow: '.github/workflows/live.yml',
  run_id: 200,
  head_sha: SHA,
  ...over,
});
const api = (over = {}) => ({
  id: 200,
  conclusion: 'success',
  path: '.github/workflows/live.yml',
  event: 'schedule',
  head_branch: 'main',
  head_sha: SHA,
  ...over,
});
/** A stubbed fetch response: status, JSON body, optional headers. */
const res = (status, body = {}, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] },
  json: async () => body,
});
const quiet = { repository: 'owner/repo', delays: [0, 0, 0], log: () => {} };

test('verifyRun passes a run that matches its record', () => {
  assert.deepEqual(verifyRun(record(), api()), []);
});

test('verifyRun rejects each way a run can disagree with its record', () => {
  const cases = [
    [api({ conclusion: 'failure' }), /conclusion is "failure", not "success"/],
    [api({ path: '.github/workflows/validate.yml' }), /workflow path is ".github\/workflows\/validate.yml"/],
    // A pull_request run executed the pull request's own code: never evidence.
    [api({ event: 'pull_request' }), /event "pull_request" is not evidence/],
    [api({ head_branch: 'feature' }), /head_branch is "feature", not "main"/],
    [api({ head_sha: 'e'.repeat(40) }), /head_sha is "e{40}", not "f{40}"/],
    [api({ id: 201 }), /run id is 201, not 200/],
  ];
  for (const [bad, want] of cases) {
    assert.match(verifyRun(record(), bad).join('\n'), want);
  }
});

test('verifyRun rejects a recorded workflow outside .github/workflows/', () => {
  assert.match(
    verifyRun(record({ workflow: 'live.yml' }), api({ path: 'live.yml' })).join('\n'),
    /recorded workflow "live.yml" is not a file under \.github\/workflows\//,
  );
});

test('verifyValidation fetches each record by run_id, unauthenticated', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push([url, init.headers.authorization]);
    return res(200, api());
  };
  const out = await verifyValidation({ runs: [record()] }, { ...quiet, fetchFn });
  assert.deepEqual(out, { errors: [], rateLimit: [] });
  assert.deepEqual(calls, [['https://api.github.com/repos/owner/repo/actions/runs/200', undefined]]);
});

test('verifyValidation reports a run the API does not know - a fake run URL', async () => {
  const fetchFn = async () => res(404, {});
  const { errors } = await verifyValidation({ runs: [record({ run_id: 999 })] }, { ...quiet, fetchFn });
  assert.match(errors.join('\n'), /run 999 \(leaf-a\): GET .* returned 404 - no such run/);
});

test('verifyValidation surfaces a mismatch as an error', async () => {
  const fetchFn = async () => res(200, api({ event: 'pull_request' }));
  const { errors, rateLimit } = await verifyValidation({ runs: [record()] }, { ...quiet, fetchFn });
  assert.match(errors.join('\n'), /event "pull_request" is not evidence/);
  assert.deepEqual(rateLimit, []);
});

test('verifyValidation retries a rate limit and succeeds when it clears', async () => {
  let calls = 0;
  const fetchFn = async () => (calls++ < 2 ? res(403) : res(200, api()));
  const out = await verifyValidation({ runs: [record()] }, { ...quiet, fetchFn });
  assert.equal(calls, 3);
  assert.deepEqual(out, { errors: [], rateLimit: [] });
});

test('verifyValidation keeps a persistent rate limit apart from real errors', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    return res(429);
  };
  const { errors, rateLimit } = await verifyValidation({ runs: [record()] }, { ...quiet, fetchFn });
  assert.equal(calls, 4); // the first try plus three retries
  assert.deepEqual(errors, []);
  assert.match(rateLimit.join('\n'), /still 429 after 3 retries - API rate limit/);
});
