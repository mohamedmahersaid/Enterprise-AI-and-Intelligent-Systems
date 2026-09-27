import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSectionDepth, parseLines } from '../scripts/lib/sections.mjs';

const headingsOf = (lines) => {
  const headings = [];
  lines.forEach((line, index) => {
    const m = !line.fenced && line.text.match(/^(#{1,6}) (.+)$/);
    if (m) headings.push({ level: m[1].length, text: m[2], line: index });
  });
  return headings;
};

test('parseLines flags backtick and tilde fences alike, closed by their own marker', () => {
  const lines = parseLines([
    'prose',
    '~~~',
    '## Lab',
    '```',
    '~~~',
    '## Real heading',
    '  ```text',
    'indented fence content',
    '  ```',
    'after',
  ].join('\n'));
  assert.deepEqual(lines.map((l) => l.fenced),
    [false, true, true, true, true, false, true, true, true, false]);
  // The heading hidden inside the ~~~ fence is not a heading.
  assert.deepEqual(headingsOf(lines).map((h) => h.text), ['Real heading']);
});

const scenario = (n, markers = true) => [
  `### Scenario ${n}: something breaks`,
  ...(markers ? [`**Likely cause:** the cause.`, '', `**Resolution:** the fix.`] : ['Just prose.']),
];

const depthErrors = (body) => {
  const lines = parseLines(body.join('\n'));
  return checkSectionDepth('leaf.md', headingsOf(lines), lines);
};

const honest = [
  '# Leaf',
  '## Lab',
  '### Steps', 'do things',
  '### Validation', 'evidence, not activity',
  '## Troubleshooting',
  ...scenario(1), ...scenario(2), ...scenario(3), ...scenario(4), ...scenario(5),
  '## Interview questions',
  '### Q1', 'a1', '### Q2', 'a2', '### Q3', 'a3', '### Q4', 'a4',
  '## References',
];

test('the promised depth passes', () => {
  assert.deepEqual(depthErrors(honest), []);
});

test('four scenarios, or a scenario without cause and resolution, fail', () => {
  const four = depthErrors([
    '## Troubleshooting', ...scenario(1), ...scenario(2), ...scenario(3), ...scenario(4),
  ]);
  assert.ok(four.some((e) => e.includes('4 "### Scenario N:" subsection(s)')), four.join('\n'));

  const bare = depthErrors([
    '## Troubleshooting',
    ...scenario(1), ...scenario(2), ...scenario(3), ...scenario(4), ...scenario(5, false),
  ]);
  assert.ok(bare.some((e) => e.includes('no **Likely cause:** line')), bare.join('\n'));
  assert.ok(bare.some((e) => e.includes('no **Resolution:** line')), bare.join('\n'));
});

test('three interview questions fail; a Lab without a Validation subsection fails', () => {
  const errors = depthErrors([
    '## Lab', '### Steps', 'x',
    '## Interview questions', '### Q1', 'a', '### Q2', 'a', '### Q3', 'a',
  ]);
  assert.ok(errors.some((e) => e.includes('3 question(s)')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('no "### Validation" subsection')), errors.join('\n'));
});

test('a scenario heading inside a fence does not count toward the five', () => {
  const errors = depthErrors([
    '## Troubleshooting',
    ...scenario(1), ...scenario(2), ...scenario(3), ...scenario(4),
    '~~~',
    '### Scenario 5: only sample text',
    '~~~',
  ]);
  assert.ok(errors.some((e) => e.includes('4 "### Scenario N:" subsection(s)')), errors.join('\n'));
});
