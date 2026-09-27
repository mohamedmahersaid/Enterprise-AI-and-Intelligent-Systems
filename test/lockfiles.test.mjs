import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { lockedNames, missingFromLock, requirementNames } from '../scripts/lib/lockfiles.mjs';

test('requirementNames reads packages, not comments, options or versions', () => {
  const inText = [
    '# a comment naming pandas is not a requirement',
    '-r requirements.in',
    '--python-version 3.12',
    '',
    'requests==2.34.2',
    'rank_bm25',
    'mlflow-skinny>=3',
  ].join('\n');
  assert.deepEqual(requirementNames(inText), ['requests', 'rank-bm25', 'mlflow-skinny']);
});

test('lockedNames reads only pinned package lines, normalised', () => {
  const txt = [
    '# via -r requirements.in',
    'Rank_BM25==0.2.2 \\',
    '    --hash=sha256:abc',
    'requests==2.34.2 \\',
  ].join('\n');
  assert.deepEqual([...lockedNames(txt)].sort(), ['rank-bm25', 'requests']);
});

test('a package named in the .in but absent from the .txt is drift', () => {
  assert.deepEqual(missingFromLock('pandas\nrequests', 'requests==2.34.2'), ['pandas']);
  assert.deepEqual(missingFromLock('rank_bm25', 'rank-bm25==0.2.2'), []);
});

test('the repository lockfiles pin every package their .in sources name', () => {
  const read = (f) => fs.readFileSync(`scripts/${f}`, 'utf8');
  assert.deepEqual(missingFromLock(read('requirements.in'), read('requirements.txt')), [],
    'scripts/requirements.txt no longer pins everything requirements.in names; regenerate it with the pip-compile line in the .in');
  // requirements-full.in includes requirements.in via -r, so both sets must land in the full lockfile.
  assert.deepEqual(
    missingFromLock(`${read('requirements.in')}\n${read('requirements-full.in')}`, read('requirements-full.txt')),
    [],
    'scripts/requirements-full.txt no longer pins everything its .in sources name; regenerate it with the uv pip compile line in the .in');
});
