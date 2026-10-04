// The npm audit gate's rules, offline: what fails (an unexcepted high or
// critical advisory, an expired or mismatched exception, an audit that did not
// run), what only annotates (an accepted advisory, a stale exception, low and
// moderate findings), and how transitive entries collapse to root advisories.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { advisoryId, assessAudit, rootAdvisories } from '../scripts/check-audit.mjs';

const TODAY = '2026-10-04';
const BRACES = {
  name: 'braces', severity: 'high', title: 'stack exhaustion',
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
};
const report = (vias) => ({
  vulnerabilities: {
    braces: { severity: 'high', via: vias },
    micromatch: { severity: 'high', via: ['braces'] },
  },
});
const exception = (over = {}) => ({
  exceptions: [{ advisory: 'GHSA-vfj7-8cjw-p6xm', package: 'braces', reason: 'no fix', review_by: '2026-11-04', ...over }],
});

test('transitive entries collapse to one root advisory', () => {
  const roots = rootAdvisories(report([BRACES]));
  assert.equal(roots.length, 1);
  assert.equal(roots[0].id, 'GHSA-vfj7-8cjw-p6xm');
  assert.equal(advisoryId('https://example.invalid/x'), 'https://example.invalid/x');
});

test('an unexcepted high advisory fails', () => {
  const { errors } = assessAudit(report([BRACES]), { exceptions: [] }, TODAY);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /GHSA-vfj7-8cjw-p6xm/);
});

test('a current exception passes with an annotation', () => {
  const { errors, warnings } = assessAudit(report([BRACES]), exception(), TODAY);
  assert.deepEqual(errors, []);
  assert.match(warnings[0], /accepted until 2026-11-04/);
});

test('an expired or mismatched exception fails', () => {
  assert.match(assessAudit(report([BRACES]), exception({ review_by: '2026-10-03' }), TODAY).errors[0], /expired/);
  assert.match(assessAudit(report([BRACES]), exception({ package: 'micromatch' }), TODAY).errors[0], /names package/);
});

test('low findings never fail; a stale exception only annotates', () => {
  const low = { ...BRACES, severity: 'low', url: 'https://github.com/advisories/GHSA-p98j-92pf-mc4p', name: 'dompurify' };
  const { errors, warnings } = assessAudit({ vulnerabilities: { dompurify: { via: [low] } } }, exception(), TODAY);
  assert.deepEqual(errors, []);
  assert.match(warnings[0], /no longer needed/);
});

test('an audit that did not run fails rather than passing empty', () => {
  const { errors } = assessAudit({ error: { summary: 'network unreachable' } }, exception(), TODAY);
  assert.match(errors[0], /did not run/);
});
