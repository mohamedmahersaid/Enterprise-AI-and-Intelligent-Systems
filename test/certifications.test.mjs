// The certification registry checks against the real data/certifications.json:
// the retired AZ-204 entry catches the withdrawn exam however it is spelled,
// without colliding with its successor's name, and the level vocabulary
// defines every level exactly once, in reading order.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkCertifications, loadRegistry } from '../scripts/lib/certifications.mjs';
import { LEAF_LEVELS, LEVEL_DEFINITIONS } from '../scripts/lib/schema.mjs';
import { recount } from '../scripts/lib/derive.mjs';

const registry = loadRegistry();

function leafWith(t, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'leaf.md');
  fs.writeFileSync(file, body);
  return { leaves: [{ id: 'x', path: file }] };
}

test('AZ-204 is retired: the exam code and old credential name are flagged, with AI-200 as the successor', (t) => {
  const errors = checkCertifications(leafWith(t, '# T\n\nStudy for AZ-204.\n\nOr the Azure Developer Associate.\n'), registry);
  assert.equal(errors.length, 2);
  for (const e of errors) {
    assert.match(e, /AZ-204/);
    assert.match(e, /Azure AI Cloud Developer Associate \(AI-200\)/);
  }
});

test('the loose retired matcher does not collide with the successor credential name', (t) => {
  const body = '# T\n\n## Certification alignment\n\n' +
    '- **Microsoft Certified: Azure AI Cloud Developer Associate (AI-200)** - ' +
    'Develop AI solutions by using Azure data management services: pgvector similarity search.\n';
  assert.deepEqual(checkCertifications(leafWith(t, body), registry), []);
});

test('an AI-200 line must open on one of its registered domains', (t) => {
  const body = '# T\n\n## Certification alignment\n\n' +
    '- **Microsoft Certified: Azure AI Cloud Developer Associate (AI-200)** - pgvector without a domain.\n';
  const errors = checkCertifications(leafWith(t, body), registry);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /without opening on one of its official domains/);
});

test('every level is defined once and recount orders the counts in reading order', () => {
  assert.deepEqual(LEAF_LEVELS, ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Enterprise']);
  for (const level of LEAF_LEVELS) {
    assert.equal(typeof LEVEL_DEFINITIONS[level], 'string');
    assert.ok(LEVEL_DEFINITIONS[level].length > 20, `${level} has a real definition`);
  }
  const catalog = recount({
    leaves: [{ level: 'Advanced', tree: 't', branch: 'b' }, { level: 'Beginner', tree: 't', branch: 'b' }, { level: 'Enterprise', tree: 't', branch: 'b' }],
    paths: [],
  });
  assert.deepEqual(Object.keys(catalog.levelCounts), ['Beginner', 'Advanced', 'Enterprise']);
});
