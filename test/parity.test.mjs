import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchCommands, parityGates, runsGate, workflowCommands } from '../scripts/lib/parity.mjs';

const lines = (...l) => l.join('\n');

test('parityGates takes every validate:* script, and test when there is one', () => {
  const scripts = {
    validate: 'npm test && npm run validate:content',
    'validate:content': 'node a.mjs',
    'validate:commands': 'node b.mjs',
    'lint:md': 'markdownlint-cli2',
    test: 'node --test',
  };
  assert.deepEqual(parityGates(scripts), ['validate:content', 'validate:commands', 'test']);
  const { test: _omit, ...noTest } = scripts;
  assert.deepEqual(parityGates(noTest), ['validate:content', 'validate:commands']);
});

test('a workflow runs a gate from a single-line run: value', () => {
  const yml = lines('steps:', '      - name: Test the validators', '        run: npm test');
  assert.equal(runsGate(yml, 'test', 'workflow'), true);
  assert.equal(runsGate('      - run: npm run test', 'test', 'workflow'), true);
  assert.equal(
    runsGate('        run: npm run validate:scripts -- --require-all', 'validate:scripts', 'workflow'),
    true
  );
});

test('a workflow runs a gate from a run: | block', () => {
  const yml = lines(
    '      - name: Checks',
    '        run: |',
    '          npm ci',
    '',
    '          npm test',
    '      - name: Next',
    '        run: echo done'
  );
  assert.deepEqual(workflowCommands(yml), ['npm ci', 'npm test', 'echo done']);
  assert.equal(runsGate(yml, 'test', 'workflow'), true);
});

test('a workflow that only mentions a gate does not run it', () => {
  const commented = lines(
    '      # npm test: Unit tests for the validators themselves.',
    '      - name: Test the validators',
    '        run: echo skipped'
  );
  assert.equal(runsGate(commented, 'test', 'workflow'), false);
  assert.equal(runsGate(commented.replace(/test/g, 'validate:content'), 'validate:content', 'workflow'), false);

  const named = lines('      - name: npm run validate:content', '        run: echo skipped');
  assert.equal(runsGate(named, 'validate:content', 'workflow'), false);

  const trailing = '        run: echo skipped # npm test';
  assert.equal(runsGate(trailing, 'test', 'workflow'), false);

  const shellComment = lines('        run: |', '          # npm test', '          echo skipped');
  assert.equal(runsGate(shellComment, 'test', 'workflow'), false);
});

test('a gate name is matched whole, not as a prefix of another', () => {
  assert.equal(runsGate('        run: npm run validate:contents', 'validate:content', 'workflow'), false);
  assert.equal(runsGate('        run: npm testing', 'test', 'workflow'), false);
  assert.equal(runsGate('call :run_step "Label" validate:contents', 'validate:content', 'batch'), false);
  assert.equal(runsGate('call :run_step "Label" testing', 'test', 'batch'), false);
});

test('run.bat runs a gate through :run_step or npm', () => {
  const bat = lines(':t_validate', 'call :run_step "Testing the validators" test', 'if errorlevel 1 exit /b 1');
  assert.equal(runsGate(bat, 'test', 'batch'), true);
  assert.equal(runsGate('call :run_step "Parsing" validate:mermaid', 'validate:mermaid', 'batch'), true);
  assert.equal(runsGate('call npm test', 'test', 'batch'), true);
});

test('run.bat rem, :: and echo lines do not run a gate', () => {
  const bat = lines(
    'rem call :run_step "Testing the validators" test',
    'REM npm test',
    ':: npm run validate:content',
    'echo     test        unit tests for the validators: npm test',
    '@echo call :run_step "x" validate:content'
  );
  assert.deepEqual(batchCommands(bat), []);
  assert.equal(runsGate(bat, 'test', 'batch'), false);
  assert.equal(runsGate(bat, 'validate:content', 'batch'), false);
});

test('an unknown runner kind is an error, not a silent pass', () => {
  assert.throws(() => runsGate('npm test', 'test', 'yaml'), /unknown runner kind/);
});
