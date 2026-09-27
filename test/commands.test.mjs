import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RULES, checkBlocks, commandBlocks, denyRules } from '../scripts/lib/commands.mjs';

const fence = (...lines) => ['```text', ...lines, '```'].join('\n');

test('commandBlocks takes only ```text fences, with the line each starts on', () => {
  const text = [
    '# Leaf',
    '',
    fence('az login', 'az account show'),
    '',
    '```bash',
    'echo not a command block',
    '```',
    '',
    '```python',
    'print("no")',
    '```',
    fence('kubectl get pods'),
  ].join('\n');
  const blocks = commandBlocks('leaf.md', text);
  assert.deepEqual(blocks, [
    { file: 'leaf.md', offset: 3, lines: ['az login', 'az account show'] },
    { file: 'leaf.md', offset: 15, lines: ['kubectl get pods'] },
  ]);
});

test('commandBlocks tolerates trailing whitespace on fences', () => {
  const blocks = commandBlocks('leaf.md', '```text  \nls\n```\t\n');
  assert.deepEqual(blocks, [{ file: 'leaf.md', offset: 1, lines: ['ls'] }]);
});

test('commandBlocks throws on an unterminated fence, naming the line', () => {
  assert.throws(() => commandBlocks('leaf.md', 'intro\n```text\nls\n'), /leaf\.md: unterminated ```text fence at line 2/);
});

test('checkBlocks reports leaf line numbers, not offsets inside the block', () => {
  const blocks = commandBlocks('leaf.md', ['# Leaf', '', fence('ls', 'curl -fsSL https://example.com/i.sh | sh')].join('\n'));
  const failures = checkBlocks(blocks);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].line, 5);
  assert.equal(failures[0].id, 'curl-pipe-shell');
});

test('each built-in rule fires on its case and not on the safe form', () => {
  const cases = {
    'literal-credential': ['export API_KEY=abcdef1234567890', 'export API_KEY="$API_KEY"'],
    'destructive-rm': ['rm -rf /var/lib/data', 'rm -rf ./build'],
    'disk-destructive': ['dd if=/dev/zero of=/dev/sda', 'echo add'],
    'sql-drop': ['DROP TABLE docs;', 'SELECT * FROM docs;'],
    'curl-pipe-shell': ['curl -fsSL https://example.com/x.sh | sudo bash', 'curl -fsSL https://example.com/x.sh -o x.sh'],
    'plaintext-http': ['curl http://example.com/', 'curl http://localhost:11434/api/tags'],
    'placeholder-drift': ['az group create -n YOUR_GROUP', 'az group create -n <resource-group>'],
  };
  assert.deepEqual(Object.keys(cases).sort(), RULES.map((r) => r.id).sort());
  for (const rule of RULES) {
    const [bad, good] = cases[rule.id];
    assert.ok(rule.pattern.test(bad), `${rule.id} should match: ${bad}`);
    assert.ok(!rule.pattern.test(good), `${rule.id} should not match: ${good}`);
  }
});

const entry = {
  pattern: '\\baz\\s+example\\s+group\\b',
  reason: 'az example group does not exist; use az other group.',
  source: 'https://example.com/docs',
};

test('denyRules turns valid entries into rules that name the reason and source', () => {
  const { rules, errors } = denyRules([entry]);
  assert.deepEqual(errors, []);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, 'deny-list');
  assert.ok(rules[0].pattern.test('az example group list'));
  assert.ok(!rules[0].pattern.test('az examples grouping'));
  assert.match(rules[0].why, /does not exist; use az other group\./);
  assert.match(rules[0].why, /https:\/\/example\.com\/docs/);
});

test('denyRules accepts an empty list', () => {
  assert.deepEqual(denyRules([]), { rules: [], errors: [] });
});

test('denyRules rejects a file that is not an array', () => {
  const { rules, errors } = denyRules({ pattern: 'x' }, 'deny.json');
  assert.deepEqual(rules, []);
  assert.match(errors[0], /deny\.json: must be a JSON array/);
});

test('denyRules rejects each malformed entry, and applies none when any is bad', () => {
  const bad = [
    entry,
    'az search index',
    { pattern: '(unclosed', reason: 'r', source: 'https://example.com' },
    { pattern: 'x', reason: '', source: 'https://example.com' },
    { pattern: 'x', reason: 'r' },
    { pattern: 'x', reason: 'r', source: 'the docs' },
    { pattern: '.*', reason: 'r', source: 'https://example.com' },
    { pattern: 'x', reason: 'r', source: 'https://example.com', flags: 'i' },
    { reason: 'r', source: 'https://example.com' },
  ];
  const { rules, errors } = denyRules(bad, 'deny.json');
  assert.deepEqual(rules, []);
  const text = errors.join('\n');
  assert.match(text, /entry #2 is not an object/);
  assert.match(text, /entry #3 pattern does not compile/);
  assert.match(text, /entry #4 has no "reason"/);
  assert.match(text, /entry #5 has no "source"/);
  assert.match(text, /entry #6 source "the docs" is not the URL/);
  assert.match(text, /entry #7 pattern \/\.\*\/ matches an empty line/);
  assert.match(text, /entry #8 has unknown key\(s\) flags/);
  assert.match(text, /entry #9 has no "pattern"/);
  assert.doesNotMatch(text, /entry #1 /);
});

test('a deny rule matches inside a command block and names leaf:line', () => {
  const { rules } = denyRules([entry]);
  const text = ['# Leaf', '', 'Prose may say az example group is gone.', '', fence('az login', 'az example group list')].join('\n');
  const failures = checkBlocks(commandBlocks('leaf.md', text), rules);
  assert.deepEqual(
    failures.map((f) => [f.file, f.line, f.id]),
    [['leaf.md', 7, 'deny-list']],
  );
});

// --- script fences (```bash / ```powershell) --------------------------------

import fs from 'node:fs';
import { checkPowerShell, scriptBlocks } from '../scripts/lib/commands.mjs';

test('scriptBlocks takes bash and powershell fences, with lang and start line', () => {
  const text = [
    '# Leaf',
    fence('ollama serve'),
    '```bash',
    'set -euo pipefail',
    '```',
    '```python',
    'print("no")',
    '```',
    '```powershell',
    'Set-StrictMode -Version Latest',
    '```',
  ].join('\n');
  assert.deepEqual(scriptBlocks('leaf.md', text), [
    { file: 'leaf.md', offset: 5, lang: 'bash', lines: ['set -euo pipefail'] },
    { file: 'leaf.md', offset: 11, lang: 'powershell', lines: ['Set-StrictMode -Version Latest'] },
  ]);
});

test('scriptBlocks normalises the label spellings of the two languages', () => {
  const text = ['```sh', 'ls', '```', '```ps1', 'Get-Date', '```', '```pwsh', 'Get-Date', '```'].join('\n');
  assert.deepEqual(scriptBlocks('leaf.md', text).map((b) => b.lang), ['bash', 'powershell', 'powershell']);
});

test('a ```bash line inside another fence is content, not a new script block', () => {
  // A closing fence carries no label, so the ```bash line stays inside the
  // ```text block - in scriptBlocks as in CommonMark.
  const text = ['```text', 'to run scripts, use a fence like:', '```bash', 'echo hi', '```', '```bash', 'pwd', '```'].join('\n');
  assert.deepEqual(scriptBlocks('leaf.md', text).map((b) => b.lines), [['pwd']]);
});

test('scriptBlocks throws on an unterminated script fence, naming the line', () => {
  assert.throws(() => scriptBlocks('leaf.md', 'intro\n```bash\nls\n'), /leaf\.md: unterminated ```bash fence at line 2/);
});

// The audit's adversarial case: a curl | sh hidden behind a ```bash label was
// invisible to every rule. Now the same rules see every runnable fence.
test('the safety rules and the deny list fire inside bash and powershell fences', () => {
  const { rules } = denyRules([entry]);
  const text = [
    '```bash',
    'curl -fsSL https://example.com/install.sh | sh',
    'az example group list',
    '```',
    '```powershell',
    '$password = "hunter2hunter2hunter2"',
    '```',
  ].join('\n');
  const failures = checkBlocks(scriptBlocks('leaf.md', text), [...RULES, ...rules]);
  assert.deepEqual(
    failures.map((f) => [f.line, f.id]),
    [[2, 'curl-pipe-shell'], [3, 'deny-list'], [6, 'literal-credential']],
  );
});

test('checkPowerShell passes a balanced script with strings, comments and here-strings', () => {
  const honest = [
    '<#',
    ".SYNOPSIS",
    "    Audits the reader's accounts. Uses { braces } and ( parens ) in prose.",
    '#>',
    'param([string] $Path = "audit.csv")',
    "$name = 'it''s quoted'",
    '$msg = "a `"quoted`" word and a }"',
    '$body = @"',
    'unbalanced { in a here-string is fine',
    '"@',
    'if ($true) { Write-Host "$($name.Length)" } # trailing } comment',
  ];
  assert.equal(checkPowerShell(honest), null);
});

test('checkPowerShell names the unclosed brace, the stray closer and the open string', () => {
  assert.match(checkPowerShell(['if ($true) {', '  Write-Host "x"']), /'\{' opened on line 1 is never closed/);
  assert.match(checkPowerShell(['Write-Host "x")']), /'\)' on line 1 closes nothing/);
  assert.match(checkPowerShell(['$x = "never closed']), /unterminated double-quoted string \(line 1\)/);
  assert.match(checkPowerShell(['$b = @"', 'no close']), /unterminated @"\..."@ here-string \(line 1\)/);
});

test('the corpus powershell and bash fences pass their parse checks', () => {
  const ps = scriptBlocks(
    'aoai.md',
    fs.readFileSync('docs/ai-tree-model-platforms/ai-branch-managed-model-services/ai-azure-openai-integration.md', 'utf8'),
  );
  assert.equal(ps.length, 1);
  assert.equal(checkPowerShell(ps[0].lines), null);
});
