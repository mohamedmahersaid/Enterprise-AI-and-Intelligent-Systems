// The currency check's rules, exercised offline: what fails the weekly run
// (a retirement inside the window, a passed review date), what only
// annotates (a major behind, an unreachable registry), and the pin parsing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assess,
  daysUntil,
  majorOf,
  packageJsonPins,
  parseDirectNames,
  parseRequirementPins,
  RETIREMENT_WINDOW_DAYS,
} from '../scripts/check-currency.mjs';

const TODAY = '2026-09-28';

test('a retirement inside the window fails; outside it passes', () => {
  const near = { currency: { models: [{ name: 'm', version: 'v', retires: '2026-12-01', source: 's' }] } };
  const far = { currency: { models: [{ name: 'm', version: 'v', retires: '2027-09-02', source: 's' }] } };
  assert.equal(assess(near, TODAY).errors.length, 1);
  assert.match(assess(near, TODAY).errors[0], /retires in \d+ days/);
  assert.deepEqual(assess(far, TODAY).errors, []);
  assert.ok(daysUntil('2026-12-01', TODAY) <= RETIREMENT_WINDOW_DAYS);
});

test('a passed review_by fails; one within the warning window only annotates', () => {
  const passed = { currency: { api_versions: [{ service: 'S', version: 'v', review_by: '2026-09-01', source: 's' }] } };
  const soon = { currency: { npx: [{ package: 'p', version: '1.0.0', review_by: '2026-10-10', source: 's' }] } };
  assert.equal(assess(passed, TODAY).errors.length, 1);
  assert.match(assess(passed, TODAY).errors[0], /passed its review date/);
  const verdict = assess(soon, TODAY);
  assert.deepEqual(verdict.errors, []);
  assert.equal(verdict.warnings.length, 1);
});

test('a pinned major behind the registry annotates and never fails', () => {
  const verdict = assess({
    currency: {},
    npmPins: new Map([['mermaid', '11.17.2']]),
    latest: new Map([['npm:mermaid', '12.0.0']]),
  }, TODAY);
  assert.deepEqual(verdict.errors, []);
  assert.equal(verdict.warnings.length, 1);
  assert.match(verdict.warnings[0], /major behind/);
  const same = assess({
    currency: {},
    npmPins: new Map([['mermaid', '11.17.2']]),
    latest: new Map([['npm:mermaid', '11.18.0']]),
  }, TODAY);
  assert.deepEqual(same.warnings, []);
});

test('an unreachable registry annotates the pin as unchecked', () => {
  const verdict = assess({
    currency: {},
    pypiPins: new Map([['feast', '0.66.0']]),
    latest: new Map([['pypi:feast', null]]),
  }, TODAY);
  assert.deepEqual(verdict.errors, []);
  assert.match(verdict.warnings[0], /could not fetch/);
});

test('requirement parsing takes name==version lines and skips hashes and comments', () => {
  const pins = parseRequirementPins('# comment\nsix==1.17.0 \\\n    --hash=sha256:abc\nFeast==0.66.0\n');
  assert.equal(pins.get('six'), '1.17.0');
  assert.equal(pins.get('feast'), '0.66.0');
  assert.equal(pins.size, 2);
});

test('package.json pins take exact versions only', () => {
  const pins = packageJsonPins({ devDependencies: { mermaid: '11.17.2', other: '^2.0.0' } });
  assert.deepEqual([...pins], [['mermaid', '11.17.2']]);
  assert.equal(majorOf('11.17.2'), 11);
  assert.equal(majorOf('v2.8.0'), 2);
});

test('direct names come from pinned and bare .in lines, normalised, with -r includes separate', () => {
  const { names, includes } = parseDirectNames('-r requirements.in\nfeast\nrank_bm25==0.2.2  # pinned\n# comment\nmlflow-skinny\n');
  assert.deepEqual([...names].sort(), ['feast', 'mlflow-skinny', 'rank-bm25']);
  assert.deepEqual(includes, ['requirements.in']);
  assert.equal(parseRequirementPins('rank-bm25==0.2.2\n').get('rank-bm25'), '0.2.2');
});
