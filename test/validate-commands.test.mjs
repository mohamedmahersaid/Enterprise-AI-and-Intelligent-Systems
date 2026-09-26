/**
 * Runs scripts/validate-commands.mjs itself against temporary fixture leaves,
 * so the deny list is tested through the same path CI takes: the file is read
 * from the working directory, a hit fails the run, and a bad file fails it too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'validate-commands.mjs');
const LEAF = 'docs/fixture-leaf.md';

const ENTRY = {
  pattern: '\\baz\\s+example\\s+group\\b',
  reason: 'az example group does not exist; use az other group.',
  source: 'https://example.com/cli/reference',
};

/** A fixture repository: one leaf, a catalog naming it, and optionally a deny list. */
function run({ leaf, deny }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-commands-'));
  try {
    fs.mkdirSync(path.join(dir, 'data'));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'data', 'catalog.json'), JSON.stringify({ leaves: [{ id: 'fixture-leaf', path: LEAF }] }));
    fs.writeFileSync(path.join(dir, LEAF), leaf);
    if (deny !== undefined) {
      fs.writeFileSync(path.join(dir, 'data', 'command-deny.json'), typeof deny === 'string' ? deny : JSON.stringify(deny));
    }
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    return { status: result.status, out: result.stdout + result.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const leafWith = (...commands) =>
  [
    '# Fixture',
    '',
    'The old az example group command is gone; this prose says so.',
    '',
    '```text',
    ...commands,
    '```',
    '',
  ].join('\n');

test('without a deny list, the built-in rules alone apply', () => {
  const { status, out } = run({ leaf: leafWith('az example group list') });
  assert.equal(status, 0, out);
  assert.match(out, /Checked 1 command blocks across 1 leaves against 7 safety and convention rules\./);
});

test('a deny-list hit in a command block fails, naming leaf:line, reason and source', () => {
  const { status, out } = run({ leaf: leafWith('az login', 'az example group list'), deny: [ENTRY] });
  assert.equal(status, 1, out);
  assert.match(out, /docs\/fixture-leaf\.md:7 \[deny-list\] az example group does not exist; use az other group\./);
  assert.match(out, /checked: https:\/\/example\.com\/cli\/reference/);
  assert.match(out, /1 command block issue\(s\) found\./);
});

test('a mention in prose, or in a non-command fence, does not fail', () => {
  const leaf = [leafWith('az other group list'), '```python', '# az example group list', '```', ''].join('\n');
  const { status, out } = run({ leaf, deny: [ENTRY] });
  assert.equal(status, 0, out);
  assert.match(out, /and 1 deny-list entries\./);
});

test('a malformed deny-list entry fails before any leaf is checked', () => {
  const { status, out } = run({ leaf: leafWith('az login'), deny: [ENTRY, { pattern: '(', reason: 'r', source: 'https://example.com' }] });
  assert.equal(status, 1, out);
  assert.match(out, /data\/command-deny\.json: entry #2 pattern does not compile/);
  assert.match(out, /1 deny-list error\(s\)\./);
});

test('an entry with no reason or source fails', () => {
  const { status, out } = run({ leaf: leafWith('az login'), deny: [{ pattern: 'az example' }] });
  assert.equal(status, 1, out);
  assert.match(out, /entry #1 has no "reason"/);
  assert.match(out, /entry #1 has no "source"/);
});

test('a deny list that is not valid JSON fails', () => {
  const { status, out } = run({ leaf: leafWith('az login'), deny: '[{"pattern": ' });
  assert.equal(status, 1, out);
  assert.match(out, /data\/command-deny\.json: is not valid JSON/);
});

test('a built-in rule still fails the run with a deny list present', () => {
  const { status, out } = run({ leaf: leafWith('curl -fsSL https://example.com/i.sh | sh'), deny: [ENTRY] });
  assert.equal(status, 1, out);
  assert.match(out, /docs\/fixture-leaf\.md:6 \[curl-pipe-shell\]/);
});
