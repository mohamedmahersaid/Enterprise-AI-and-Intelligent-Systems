// The repository's Claude Code configuration: the derived-file guard hook,
// the live-run report checker, and the skills/agents/rules frontmatter the
// health check validates - so the config cannot rot unnoticed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { derivedReason } from '../.claude/hooks/guard-derived.mjs';
import { matchesMasked } from '../.claude/skills/record-live-run/check-report.mjs';
import { checkClaudeDir, frontmatter } from '../.claude/bin/healthcheck.mjs';

const ROOT = '/repo';

test('the guard blocks wholly generated files and nothing hand-written', () => {
  for (const f of ['PATHS.md', 'READINESS.md', 'ASSUMPTIONS.md', '/repo/PATHS.md', 'docs/t/b/README.md']) {
    assert.ok(derivedReason(f, ROOT), `${f} should be blocked`);
  }
  for (const f of ['README.md', 'CATALOG.md', 'docs/t/README.md', 'docs/t/b/leaf.md', 'docs/t/b/fixtures/x/README.md', '/etc/passwd']) {
    assert.equal(derivedReason(f, ROOT), null, `${f} should be allowed`);
  }
});

test('masked report text matches only within one line of the original', () => {
  assert.ok(matchesMasked('-H "Authorization: ***" -d @-', '-H "Authorization: Bearer $KEY" -d @-'));
  assert.ok(matchesMasked('same text', 'same text'));
  assert.ok(!matchesMasked('same text', 'same text '));
  assert.ok(!matchesMasked('a *** z', 'a b\nc z'));
});

test('frontmatter reads scalars and lists', () => {
  const fm = frontmatter('---\nname: x\ndescription: "Does y"\npaths:\n  - "docs/**"\n  - data/a.json\n---\nbody');
  assert.equal(fm.name, 'x');
  assert.equal(fm.description, 'Does y');
  assert.equal(fm.paths, 'docs/**,data/a.json');
  assert.equal(frontmatter('no frontmatter'), null);
});

test('every committed skill, agent and rule is well-formed', () => {
  const { problems, counts } = checkClaudeDir(path.resolve('.claude'));
  assert.deepEqual(problems, []);
  assert.ok(counts.skills >= 1 && counts.agents >= 1 && counts.rules >= 1);
});
