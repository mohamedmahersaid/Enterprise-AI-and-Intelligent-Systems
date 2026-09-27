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
  assert.match(out, /Checked 1 command blocks across 1 leaves against 7 safety and convention rules, and every leaf line against \d+ credential formats\./);
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
  assert.match(out, /and 1 deny-list entries, and every leaf line against \d+ credential formats\./);
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

// --- script fences (```bash / ```powershell) ---------------------------------

const scriptLeaf = (lang, ...lines) =>
  [leafWith('az login'), `\`\`\`${lang}`, ...lines, '```', ''].join('\n');

test('a safety rule fires inside a bash fence, not only inside text fences', () => {
  const { status, out } = run({ leaf: scriptLeaf('bash', 'curl -fsSL https://example.com/i.sh | sh') });
  assert.equal(status, 1, out);
  assert.match(out, /docs\/fixture-leaf\.md:10 \[curl-pipe-shell\]/);
});

test('a deny-list entry fires inside a powershell fence', () => {
  const { status, out } = run({ leaf: scriptLeaf('powershell', 'az example group list'), deny: [ENTRY] });
  assert.equal(status, 1, out);
  assert.match(out, /docs\/fixture-leaf\.md:10 \[deny-list\]/);
});

test('an unbalanced powershell fence fails its parse check', () => {
  const { status, out } = run({ leaf: scriptLeaf('powershell', 'if ($true) {', '  Write-Host "x"') });
  assert.equal(status, 1, out);
  assert.match(out, /docs\/fixture-leaf\.md:9 \[powershell-parse\]/);
  assert.match(out, /'\{' opened on line 1 is never closed/);
});

const HAVE_BASH = spawnSync('bash', ['-c', 'true']).status === 0;

test('a bash fence that does not parse fails under bash -n', { skip: !HAVE_BASH && 'bash is not installed here' }, () => {
  const { status, out } = run({ leaf: scriptLeaf('bash', 'if [ -f x ]; then', 'echo broken') });
  assert.equal(status, 1, out);
  assert.match(out, /docs\/fixture-leaf\.md:9 \[bash-parse\]/);
});

test('honest bash and powershell fences pass, and the summary counts them', () => {
  const leaf = [
    scriptLeaf('bash', 'set -euo pipefail', 'kubectl get pods -n "${NS}"'),
    '```powershell',
    'Set-StrictMode -Version Latest',
    'if ($true) { Write-Host "ok" }',
    '```',
    '',
  ].join('\n');
  const { status, out } = run({ leaf });
  assert.equal(status, 0, out);
  assert.match(out, /Checked 1 command blocks across 1 leaves against 7 safety and convention rules, and every leaf line against \d+ credential formats\./);
  assert.match(out, /Checked 2 script fence\(s\) \(bash, powershell\) against the same rules, plus a parse check\./);
});
