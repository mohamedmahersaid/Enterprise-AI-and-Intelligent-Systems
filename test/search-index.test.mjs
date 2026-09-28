// The full-text search index: what searchEntry pulls out of a leaf, and the
// byte budget the build enforces on the serialized file.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  headingTexts,
  explanationParagraph,
  snippet,
  haystack,
  searchEntry,
  indexSizeProblem,
  INDEX_BUDGET_BYTES,
} from '../scripts/lib/search-index.mjs';

const LEAF = {
  id: 'ai-example',
  name: 'Example Leaf',
  level: 'Beginner',
  readiness: 'lab',
  tree: 'A Tree',
  branch: 'A Branch',
  path: 'docs/a-tree/a-branch/ai-example.md',
  needs: ['ollama'],
};

const BODY = `# Example Leaf

**Level:** Beginner

## Explanation

Feature stores keep **point-in-time** joins honest, so [training](x.md) and
serving read the same values.

A second paragraph the index must not include.

## Commands

### Command 1

\`\`\`bash
kubectl get pods
\`\`\`

\`\`\`text
## a heading inside a fence is not a heading
\`\`\`

## Lab
`;

test('headingTexts collects H2/H3 outside fences and skips the H1', () => {
  assert.deepEqual(headingTexts(BODY), ['Explanation', 'Commands', 'Command 1', 'Lab']);
});

test('explanationParagraph takes only the first paragraph, as plain text', () => {
  const p = explanationParagraph(BODY);
  assert.equal(p, 'Feature stores keep point-in-time joins honest, so training and serving read the same values.');
  assert.ok(!p.includes('second paragraph'));
});

test('explanationParagraph is empty for a page without the section', () => {
  assert.equal(explanationParagraph('# A branch README\n\nSome intro.\n'), '');
});

test('explanationParagraph skips an opening H3 and stops at the next H2', () => {
  const body = '## Explanation\n\n### A subheading first\n\nThe real opening paragraph.\n\n## Commands\n\nNot this.\n';
  assert.equal(explanationParagraph(body), 'The real opening paragraph.');
  assert.equal(explanationParagraph('## Explanation\n\n### Only a heading\n\n## Commands\n\nProse.\n'), '');
});

test('snippet clamps at a word boundary with an ellipsis, and leaves short text alone', () => {
  assert.equal(snippet('short'), 'short');
  const long = 'word '.repeat(60).trim();
  const cut = snippet(long);
  assert.ok(cut.length <= 161);
  assert.ok(cut.endsWith('…'));
  assert.ok(!cut.includes('word wor…'), 'never cuts inside a word');
});

test('haystack lowercases, splits into words and keeps each word once', () => {
  assert.equal(haystack(['Alpha alpha', 'beta, ALPHA']), 'alpha beta');
  assert.ok(haystack(['q4_K_M and http://x']).includes('q4_k_m'));
});

test('searchEntry indexes headings, the explanation, tools and needs', () => {
  const entry = searchEntry(LEAF, BODY);
  assert.equal(entry.url, 'docs/a-tree/a-branch/ai-example.html');
  assert.equal(entry.readiness, 'Lab');
  assert.ok(entry.description.startsWith('Feature stores keep point-in-time'));
  for (const word of ['point-in-time', 'commands', 'kubectl', 'ollama', 'ai-example']) {
    assert.ok(entry.haystack.includes(word), `haystack has ${word}`);
  }
  assert.ok(!entry.haystack.includes('second'), 'later paragraphs stay out');
  assert.ok(!entry.haystack.includes('fence'), 'fenced pseudo-headings stay out');
});

test('indexSizeProblem passes under the budget and names the overrun above it', () => {
  assert.equal(indexSizeProblem('[]'), null);
  const problem = indexSizeProblem('x'.repeat(INDEX_BUDGET_BYTES + 1));
  assert.ok(problem && problem.includes('over its'));
});
