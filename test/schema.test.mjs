import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkCatalogShape, checkLiveSpec, checkValidationShape, orphanDocs } from '../scripts/lib/schema.mjs';

const leaf = (over = {}) => ({
  id: 'ai-example-leaf',
  name: 'Example Leaf',
  level: 'Beginner',
  readiness: 'lab',
  needs: ['runner'],
  tree: 'Tree',
  branch: 'Branch',
  path: 'docs/ai-tree-x/ai-branch-y/ai-example-leaf.md',
  ...over,
});

const catalog = (leaves) => ({
  forestId: 'f', name: 'F', description: 'd', repository: 'r',
  treeCount: 1, branchCount: 1, expectedLeafCount: leaves.length, pathCount: 0,
  levelCounts: {}, paths: [], leaves,
});

test('a well-formed catalog leaf passes the shape check', () => {
  assert.deepEqual(checkCatalogShape(catalog([leaf()])), []);
});

test('a made-up level, an unknown key and a bad slug each fail by name', () => {
  const errors = checkCatalogShape(catalog([
    leaf({ level: 'Guru' }),
    leaf({ id: 'ai-second-leaf', path: 'docs/t/b/ai-second-leaf.md', extraField: 'x' }),
    leaf({ id: 'Not_A_Slug', path: 'docs/t/b/Not_A_Slug.md' }),
  ]));
  assert.ok(errors.some((e) => e.includes('"Guru"')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('unknown key(s) extraField')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('lowercase hyphenated slug')), errors.join('\n'));
});

test('a missing field, a bad needs vocabulary and a stray path each fail', () => {
  const errors = checkCatalogShape(catalog([
    leaf({ tree: '' }),
    leaf({ id: 'ai-b', path: 'docs/t/b/ai-b.md', needs: ['mainframe'] }),
    leaf({ id: 'ai-c', path: 'notes/ai-c.md' }),
  ]));
  assert.ok(errors.some((e) => e.includes('has no "tree"')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('needs mainframe')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('docs/<tree-dir>/<branch-dir>/ai-c.md')), errors.join('\n'));
});

const run = (over = {}) => ({
  leaf: 'ai-example-leaf', date: '2026-09-26', workflow: '.github/workflows/live.yml',
  run: 'https://github.com/o/r/actions/runs/1', environment: 'e', covered: 'c', result: 'pass',
  ...over,
});

test('validation records pass with extra fields and fail on a wrong type', () => {
  // $comment at the top level and fields a later change adds must pass, so
  // the merge order with other work does not matter.
  assert.deepEqual(checkValidationShape({ $comment: 'x', runs: [run({ head_sha: 'be50a13' })] }), []);
  const errors = checkValidationShape({ runs: [run({ result: 1 }), 'not a record'] });
  assert.ok(errors.some((e) => e.includes('"result" is not a non-empty string')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('run #2 is not an object')), errors.join('\n'));
  assert.deepEqual(checkValidationShape({ runs: 'no' }), ['data/validation.json: "runs" is not an array.']);
});

test('a live spec passes with unknown keys and fails on a broken shape', () => {
  const spec = {
    version: 'ollama -v',
    files: { Modelfile: 'FROM x' },
    steps: [{ command: 1, background: true, ready: 'curl -sf x', timeout: 60, futureKey: 'ok' }],
    skip: { 9: 'binds every interface' },
    futureTopLevel: true,
  };
  assert.deepEqual(checkLiveSpec(spec, 'data/live/x.json'), []);

  const errors = checkLiveSpec({
    steps: [{ command: 0 }, { command: 2, expect: '(' }, { timeout: 'soon' }],
    skip: { nine: '' },
  }, 'data/live/x.json');
  assert.ok(errors.some((e) => e.includes('step #1 "command" is not a positive integer')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('does not compile as a regular expression')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('step #3 "command"')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('step #3 "timeout" is not a number')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('skip key "nine"')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('skip "nine" has no reason')), errors.join('\n'));

  assert.deepEqual(checkLiveSpec({ steps: [] }, 'f'), ['f: "steps" is not a non-empty array.']);
});

test('orphanDocs flags leaf-shaped files and exempts READMEs and fixtures', () => {
  const files = [
    'docs/t/b/ai-known.md',
    'docs/t/b/ai-orphan.md',
    'docs/t/b/README.md',
    'docs/t/b/fixtures/ai-data/guideline.md',
  ];
  assert.deepEqual(orphanDocs(files, ['docs/t/b/ai-known.md']), ['docs/t/b/ai-orphan.md']);
});
