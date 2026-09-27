import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { checkSpec, parseCommands } from '../scripts/lib/live-spec.mjs';

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
  const spec = { steps: [{ command: 1 }, { command: 7 }], skip: { 2: 'reason' } };
  assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), [
    'spec.json: names Command 7, which the leaf does not have.',
  ]);
});

test('checkSpec reports a leaf Command neither run nor skipped', () => {
  const spec = { steps: [{ command: 1 }] };
  assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), [
    'spec.json: Command 2 is neither run nor skipped with a reason.',
  ]);
});

test('checkSpec rejects a skip without a reason, a non-numeric skip key, and run-and-skipped', () => {
  const spec = { steps: [{ command: 1 }, { command: 2 }], skip: { 2: '  ', last: 'reason' } };
  const errors = checkSpec(spec, twoCommands(), 'spec.json');
  assert.match(errors.join('\n'), /skip key "last" is not a Command number/);
  assert.match(errors.join('\n'), /skip 2 has no reason/);
  assert.match(errors.join('\n'), /Command 2 is both run and skipped/);
});

// Phase 8 adds spec fields; an older checker must not fail a newer spec.
test('checkSpec ignores keys it does not know, at the top level and in steps', () => {
  const spec = {
    steps: [{ command: 1, retries: 3, matrix: { os: 'ubuntu' } }],
    skip: { 2: 'reason' },
    version: 'tool -v',
    fixtures_v2: {},
  };
  assert.deepEqual(checkSpec(spec, twoCommands(), 'spec.json'), []);
});

test('checkSpec rejects fixture names that escape the working directory', () => {
  for (const name of ['../evil', 'sub/dir', 'sub\\dir', ' ']) {
    const spec = { steps: [{ command: 1 }, { command: 2 }], files: { [name]: 'content' } };
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
