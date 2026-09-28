// The leaf-page helpers behind the site's facts panel, pager order and
// "On this page" list.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEVEL_ORDER, levelOrdered, stripHeaderBlock, tocOf } from '../scripts/lib/leaf-page.mjs';

test('levelOrdered puts every Beginner before Intermediate and keeps order within a level', () => {
  const leaves = [
    { id: 'a', level: 'Advanced' },
    { id: 'b1', level: 'Beginner' },
    { id: 'i', level: 'Intermediate' },
    { id: 'b2', level: 'Beginner' },
    { id: 'e', level: 'Enterprise' },
    { id: 'x', level: 'Expert' },
  ];
  assert.deepEqual(levelOrdered(leaves).map((l) => l.id), ['b1', 'b2', 'i', 'a', 'x', 'e']);
  assert.deepEqual(LEVEL_ORDER, ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Enterprise']);
});

const HEADER_BLOCK = `# A Leaf

**Level:** Beginner
**Tree:** [T](../README.md)
**Readiness:** [Lab](../../../READINESS.md#lab) - checked offline.

## Explanation

Prose.
`;

test('stripHeaderBlock removes exactly the **Field:** block under the H1', () => {
  const stripped = stripHeaderBlock(HEADER_BLOCK);
  assert.ok(!stripped.includes('**Level:**'));
  assert.ok(!stripped.includes('**Readiness:**'));
  assert.ok(stripped.includes('# A Leaf\n\n## Explanation'));
  assert.ok(stripped.includes('Prose.'));
});

test('stripHeaderBlock leaves a page whose first paragraph is prose alone', () => {
  const body = '# A README\n\nPlain opening paragraph with **bold** inside.\n';
  assert.equal(stripHeaderBlock(body), body);
  assert.equal(stripHeaderBlock('No heading at all.\n'), 'No heading at all.\n');
});

test('tocOf lists H2 headings with renderer-compatible ids, ignoring fences and H3s', () => {
  const body = '# T\n\n## First Section\n\n```text\n## not a heading\n```\n\n### sub\n\n## Second: With Punctuation\n';
  assert.deepEqual(tocOf(body), [
    { text: 'First Section', id: 'first-section' },
    { text: 'Second: With Punctuation', id: 'second-with-punctuation' },
  ]);
});
