import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { checkLivePaths, checkSpec, parseCommands, scriptHeadings } from '../scripts/lib/live-spec.mjs';

const command = (n, text, lang = 'text') =>
  [`### Command ${n}`, '', `What Command ${n} shows.`, '', `\`\`\`${lang}`, text, '```'].join('\n');

const leaf = (...sections) =>
  ['# Leaf', '', '## Explanation', '', 'Prose.', '', '## Commands', '', ...sections, '', '## Lab', '', 'Steps.'].join('\n');

test('parseCommands pairs each Command with its own fence, prose between them and all', () => {
  const { commands, errors } = parseCommands(leaf(command(1, 'ollama serve'), command(2, 'ollama pull llama3.1')), 'leaf.md');
  assert.deepEqual(errors, []);
  assert.deepEqual([...commands], [[1, 'ollama serve'], [2, 'ollama pull llama3.1']]);
});

// The audit's adversarial case: Command 8's fence was relabelled ```bash and
// the old lazy regex paired 8 with Command 9's text - a command the spec
// deliberately skips. Heading-first, 8 owns only its own span, so it errors
// and 9 keeps its own text.
test('a Command whose fence is not ```text fails loudly instead of taking the next text', () => {
  const { commands, errors } = parseCommands(
    leaf(command(8, 'curl http://127.0.0.1:11434/api/tags', 'bash'), command(9, 'OLLAMA_HOST=0.0.0.0 ollama serve')),
    'leaf.md'
  );
  assert.equal(commands.has(8), false);
  assert.equal(commands.get(9), 'OLLAMA_HOST=0.0.0.0 ollama serve');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Command 8 must hold exactly one ```text fence \(found ```bash\)/);
});

test('a Command with no fence at all fails loudly', () => {
  const { commands, errors } = parseCommands(
    leaf('### Command 1', '', 'Only prose, the fence was lost in an edit.', '', command(2, 'ls')),
    'leaf.md'
  );
  assert.equal(commands.has(1), false);
  assert.equal(commands.get(2), 'ls');
  assert.match(errors[0], /Command 1 must hold exactly one ```text fence \(found none\)/);
});

test('a Command with two text fences is ambiguous, so it errors', () => {
  const { errors } = parseCommands(
    leaf(['### Command 1', '', '```text', 'ls', '```', '', '```text', 'pwd', '```'].join('\n')),
    'leaf.md'
  );
  assert.match(errors[0], /Command 1 must hold exactly one ```text fence/);
});

test('an extra non-text fence beside the text one errors: a reader cannot tell which to run', () => {
  const { commands, errors } = parseCommands(
    leaf([command(1, 'ls'), '', '```bash', 'rm -rf /', '```'].join('\n')),
    'leaf.md'
  );
  assert.equal(commands.get(1), 'ls');
  assert.match(errors[0], /Command 1 has 1 extra fence\(s\) beside its ```text one/);
});

test('duplicate Command numbers, foreign headings and orphan fences all error', () => {
  const dup = parseCommands(leaf(command(3, 'ls'), command(3, 'pwd')), 'leaf.md');
  assert.match(dup.errors.join('\n'), /two "### Command 3" headings/);

  const foreign = parseCommands(leaf(command(1, 'ls'), '### Command 2b', '', '```text', 'pwd', '```'), 'leaf.md');
  assert.match(foreign.errors.join('\n'), /heading "### Command 2b" under ## Commands/);

  const orphan = parseCommands(leaf('```text', 'ls', '```', command(1, 'pwd')), 'leaf.md');
  assert.match(orphan.errors.join('\n'), /a ```text fence under ## Commands belongs to no Command heading/);
});

test('a heading inside a fence is content, not a Command', () => {
  const { commands, errors } = parseCommands(leaf(command(1, '### Command 2\necho not a heading')), 'leaf.md');
  assert.deepEqual(errors, []);
  assert.deepEqual([...commands.keys()], [1]);
});

test('an unterminated fence and a missing Commands section each fail loudly', () => {
  const open = parseCommands(leaf('### Command 1', '', '```text', 'ls'), 'leaf.md');
  assert.match(open.errors[0], /unterminated ```text fence under ## Commands/);

  const none = parseCommands('# Leaf\n\n## Explanation\n\nProse.\n', 'leaf.md');
  assert.match(none.errors[0], /has no "## Commands" section/);
});

const twoCommands = () => parseCommands(leaf(command(1, 'ls'), command(2, 'pwd')), 'leaf.md').commands;

test('checkSpec passes a spec that runs and skips exactly the leaf commands', () => {
  const spec = { steps: [{ command: 1, expect: 'x' }], skip: { 2: 'needs a GPU this runner lacks' } };
  assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), []);
});

test('checkSpec reports a step naming a Command the leaf lacks', () => {
  const spec = { steps: [{ command: 1, expect: 'x' }, { command: 7, expect: 'x' }], skip: { 2: 'reason' } };
  assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), [
    'spec.json: names Command 7, which the leaf does not have.',
  ]);
});

test('checkSpec reports a leaf Command neither run nor skipped', () => {
  const spec = { steps: [{ command: 1, expect: 'x' }] };
  assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), [
    'spec.json: Command 2 is neither run nor skipped with a reason.',
  ]);
});

test('checkSpec rejects a skip without a reason, a non-numeric skip key, and run-and-skipped', () => {
  const spec = { steps: [{ command: 1, expect: 'x' }, { command: 2, expect: 'x' }], skip: { 2: '  ', last: 'reason' } };
  const errors = checkSpec(spec, twoCommands(), 'spec.json');
  assert.match(errors.join('\n'), /skip key "last" is not a Command number/);
  assert.match(errors.join('\n'), /skip 2 has no reason/);
  assert.match(errors.join('\n'), /Command 2 is both run and skipped/);
});

// Phase 8 adds spec fields; an older checker must not fail a newer spec.
test('checkSpec ignores keys it does not know, at the top level and in steps', () => {
  const spec = {
    steps: [{ command: 1, expect: 'x', retries: 3, matrix: { os: 'ubuntu' } }],
    skip: { 2: 'reason' },
    version: 'tool -v',
    fixtures_v2: {},
  };
  assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), []);
});

test('checkSpec rejects fixture names that escape the working directory', () => {
  for (const name of ['../evil', 'sub/dir', 'sub\\dir', ' ']) {
    const spec = { steps: [{ command: 1, expect: 'x' }, { command: 2, expect: 'x' }], files: { [name]: 'content' } };
    assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), [
      `spec.json: files name "${name}" must be a bare file name inside the working directory.`,
    ]);
  }
});

test('checkSpec rejects a spec that is not an object, has no steps, or malformed steps', () => {
  assert.deepEqual(checkSpec([], new Map(), 'spec.json'), ['spec.json: must be a JSON object.']);
  assert.deepEqual(checkSpec({}, new Map(), 'spec.json'), ['spec.json: has no steps.']);
  const errors = checkSpec({ steps: [{ command: '1' }] }, twoCommands(), 'spec.json');
  assert.match(errors.join('\n'), /step #1 has no integer "command"/);
});

// The one recorded spec must keep passing against its real leaf: this is the
// exact pair validate:content now checks on every PR.
test('the ollama spec and leaf agree, through the same functions CI uses', () => {
  const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
  const leaf = catalog.leaves.find((l) => l.id === 'ai-ollama-local-inference');
  const spec = JSON.parse(fs.readFileSync('data/live/ai-ollama-local-inference.json', 'utf8'));
  const { commands, errors } = parseCommands(fs.readFileSync(leaf.path, 'utf8'), leaf.path);
  assert.deepEqual(errors, []);
  assert.equal(commands.size, 10);
  assert.deepEqual(checkSpec(spec, commands, 'data/live/ai-ollama-local-inference.json'), []);
});

// --- the spec fields that build and judge a run (Phase 8) --------------------

const oneCommand = () => parseCommands(leaf(command(1, 'echo <model>')), 'leaf.md').commands;
const step = (extra = {}) => ({ command: 1, expect: 'x', ...extra });

test('a foreground step must assert output, or opt out with a reason', () => {
  assert.match(checkSpec({ steps: [{ command: 1 }] }, oneCommand(), 'spec.json').join('\n'),
    /Command 1 has no "expect"/);
  assert.match(checkSpec({ steps: [{ command: 1, expect: null }] }, oneCommand(), 'spec.json').join('\n'),
    /opts out of "expect" without an "expect_reason"/);
  assert.deepEqual(
    checkSpec({ steps: [{ command: 1, expect: null, expect_reason: 'a progress stream' }] }, oneCommand(), 'spec.json'),
    []);
});

test('a background step needs its ready probe', () => {
  assert.match(checkSpec({ steps: [{ command: 1, background: true }] }, oneCommand(), 'spec.json').join('\n'),
    /background step with no "ready" probe/);
});

test('exit must be a status, and a non-zero exit requires a real expect', () => {
  assert.match(checkSpec({ steps: [step({ exit: 'no' })] }, oneCommand(), 'spec.json').join('\n'),
    /not an exit status/);
  assert.match(
    checkSpec({ steps: [{ command: 1, exit: 1, expect: null, expect_reason: 'r' }] }, oneCommand(), 'spec.json').join('\n'),
    /a real failure could hide behind the status/);
  assert.deepEqual(checkSpec({ steps: [step({ exit: [0, 2] })] }, oneCommand(), 'spec.json'), []);
});

test('until must be positive seconds on a foreground step with an expect', () => {
  assert.match(checkSpec({ steps: [step({ until: -5 })] }, oneCommand(), 'spec.json').join('\n'),
    /invalid "until"/);
  assert.match(
    checkSpec({ steps: [{ command: 1, until: 30, expect: null, expect_reason: 'r' }] }, oneCommand(), 'spec.json').join('\n'),
    /streams with "until" but has no "expect"/);
});

test('capture needs a variable name and a compiling regex with a group', () => {
  assert.match(checkSpec({ steps: [step({ capture: { name: '2bad', regex: '(x)' } })] }, oneCommand(), 'spec.json').join('\n'),
    /without a valid variable name/);
  assert.match(checkSpec({ steps: [step({ capture: { name: 'v', regex: '[' } })] }, oneCommand(), 'spec.json').join('\n'),
    /does not compile/);
  assert.match(checkSpec({ steps: [step({ capture: { name: 'v', regex: 'x' } })] }, oneCommand(), 'spec.json').join('\n'),
    /no group to capture/);
});

test('copy is confined to the leaf directory, and its destinations to the working directory', () => {
  const opts = { leafDir: 'docs/tree/branch' };
  assert.match(
    checkSpec({ steps: [step()], copy: { good: 'data/catalog.json' } }, oneCommand(), 'spec.json', opts).join('\n'),
    /must be a path under the leaf's own directory \(docs\/tree\/branch\/\)/);
  assert.match(
    checkSpec({ steps: [step()], copy: { '../up': 'docs/tree/branch/fixtures/a' } }, oneCommand(), 'spec.json', opts).join('\n'),
    /must stay inside the working directory/);
  assert.deepEqual(
    checkSpec({ steps: [step()], copy: { 'fixtures/': 'docs/tree/branch/fixtures/' } }, oneCommand(), 'spec.json', opts),
    []);
});

test('scripts must name a heading under the leaf\'s Automation scripts', () => {
  const opts = { scriptNames: new Set(['tool.py']) };
  assert.match(
    checkSpec({ steps: [step()], scripts: { 'x.py': 'other.py' } }, oneCommand(), 'spec.json', opts).join('\n'),
    /is not a ` ?#* ?### ` heading|is not a `### ` heading/);
  assert.deepEqual(checkSpec({ steps: [step()], scripts: { 'x.py': 'tool.py' } }, oneCommand(), 'spec.json', opts), []);
});

test('substitute keys are <placeholder> tokens that occur in a planned command', () => {
  assert.match(
    checkSpec({ steps: [step()], substitute: { model: 'toy' } }, oneCommand(), 'spec.json').join('\n'),
    /is not a <placeholder> token/);
  assert.match(
    checkSpec({ steps: [step()], substitute: { '<absent>': 'toy' } }, oneCommand(), 'spec.json').join('\n'),
    /occurs in no planned command/);
  assert.deepEqual(checkSpec({ steps: [step()], substitute: { '<model>': 'toy' } }, oneCommand(), 'spec.json'), []);
});

test('setup lines need a run command, env names must be valid, versions must be commands', () => {
  assert.match(checkSpec({ steps: [step()], setup: [{}] }, oneCommand(), 'spec.json').join('\n'),
    /setup #1 has no "run" command/);
  assert.match(checkSpec({ steps: [step()], env: { '2BAD': 'x' } }, oneCommand(), 'spec.json').join('\n'),
    /must be a valid variable name/);
  assert.match(checkSpec({ steps: [step()], versions: [''] }, oneCommand(), 'spec.json').join('\n'),
    /"versions" must be a list of commands/);
});

test('scriptHeadings reads the Automation scripts section, fences excluded', () => {
  const body = [
    '# L', '', '## Automation scripts', '',
    '### real.py', '', '```python', '# ### not-a-heading.py', 'x = 1', '```', '',
    '### second.py', '', '```python', 'y = 2', '```', '',
    '## After', '', '### outside.py', '',
  ].join('\n');
  assert.deepEqual([...scriptHeadings(body)].sort(), ['real.py', 'second.py']);
});

test('checkLivePaths requires every spec\'d leaf and fixtures directory in the filter', () => {
  const yml = ['on:', '  pull_request:', '    paths:', '      - data/live/**',
    '      - docs/a/b/one.md', '      - docs/a/b/fixtures/**'].join('\n');
  assert.deepEqual(checkLivePaths(yml, [{ leafPath: 'docs/a/b/one.md', fixturesDir: 'docs/a/b/fixtures' }]), []);
  const errors = checkLivePaths(yml, [{ leafPath: 'docs/a/b/two.md', fixturesDir: null }]);
  assert.match(errors.join('\n'), /do not list docs\/a\/b\/two\.md/);
});
