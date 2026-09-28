import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// End-to-end runs of scripts/live-run.mjs against a throwaway repository, so
// the spec fields that build and judge a run are proven on the real runner,
// not only on checkSpec. Each fixture repo has one leaf, its spec, and only
// commands that run anywhere (echo, cat, printf).

const LIVE_RUN = path.resolve('scripts/live-run.mjs');

const SCRIPT = 'print("kappa 0.7")\n';

function leafBody(commands) {
  return [
    '# Leaf', '',
    '## Commands', '',
    ...commands.flatMap(([n, text]) => [`### Command ${n}`, '', '```text', text, '```', '']),
    '## Automation scripts', '',
    '### tool.py', '',
    '```python', SCRIPT.trimEnd(), '```', '',
  ].join('\n');
}

/** A repo with one leaf and one spec; returns {dir, report()}. */
function repo(commands, spec, fixtures = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-run-test-'));
  const leafPath = 'docs/tree/branch/x-leaf.md';
  fs.mkdirSync(path.join(dir, 'docs/tree/branch/fixtures'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data/live'), { recursive: true });
  fs.writeFileSync(path.join(dir, leafPath), leafBody(commands));
  for (const [name, content] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(dir, 'docs/tree/branch/fixtures', name), content);
  }
  fs.writeFileSync(path.join(dir, 'data/catalog.json'), JSON.stringify({
    leaves: [{ id: 'x-leaf', path: leafPath, needs: ['runner'], level: 'Beginner', readiness: 'lab' }],
  }));
  fs.writeFileSync(path.join(dir, 'data/live/x-leaf.json'), JSON.stringify(spec));
  return dir;
}

/** Runs live-run in the repo; returns {status, stdout, report}. */
function run(dir) {
  let status = 0;
  let stdout = '';
  try {
    stdout = execFileSync('node', [LIVE_RUN, 'x-leaf', '--json', 'live-run.json'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    status = error.status ?? 1;
    stdout = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const reportPath = path.join(dir, 'live-run.json');
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { status, stdout, report };
}

test('setup runs before the commands, is reported separately and never counted as coverage', () => {
  const { status, report } = run(repo(
    [[1, 'cat built-by-setup.txt']],
    {
      setup: [{ run: 'echo scaffolding > built-by-setup.txt', expect: null ? '' : undefined }],
      steps: [{ command: 1, expect: 'scaffolding' }],
    },
  ));
  assert.equal(status, 0);
  assert.equal(report.result, 'pass');
  assert.equal(report.covered, 'Commands 1');
  assert.equal(report.setup.length, 1);
  assert.equal(report.setup[0].ok, true);
});

test('a failing setup fails the run before any command runs', () => {
  const { status, report } = run(repo(
    [[1, 'echo never-reached']],
    { setup: [{ run: 'false' }], steps: [{ command: 1, expect: 'never' }] },
  ));
  assert.equal(status, 1);
  assert.equal(report.result, 'fail');
  assert.equal(report.covered, 'no command passed');
  assert.equal(report.setup[0].ok, false);
  assert.equal(report.steps.length, 0);
});

test('copy brings the leaf\'s own fixtures in; a source outside the leaf directory is refused', () => {
  const ok = run(repo(
    [[1, 'cat fixtures/data.txt']],
    {
      copy: { 'fixtures/': 'docs/tree/branch/fixtures/' },
      steps: [{ command: 1, expect: 'from-the-repo' }],
    },
    { 'data.txt': 'from-the-repo\n' },
  ));
  assert.equal(ok.status, 0);
  assert.equal(ok.report.result, 'pass');

  const bad = run(repo(
    [[1, 'cat stolen']],
    { copy: { stolen: 'data/catalog.json' }, steps: [{ command: 1, expect: 'x' }] },
  ));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /must be a path under the leaf's own directory/);
});

test('scripts are extracted from the leaf itself, and the report pins each sha256', () => {
  const { status, report } = run(repo(
    [[1, 'python3 tool.py']],
    { scripts: { 'tool.py': 'tool.py' }, steps: [{ command: 1, expect: 'kappa 0\\.7' }] },
  ));
  assert.equal(status, 0);
  assert.equal(report.scripts_sha256['tool.py'], crypto.createHash('sha256').update(SCRIPT.trimEnd()).digest('hex'));
});

test('a scripts heading the leaf does not have fails before anything runs', () => {
  const { status, stdout } = run(repo(
    [[1, 'echo hi']],
    { scripts: { 'tool.py': 'missing.py' }, steps: [{ command: 1, expect: 'hi' }] },
  ));
  assert.equal(status, 1);
  assert.match(stdout, /missing\.py/);
});

test('substitution replaces <placeholders>, and the report records the leaf text and what ran', () => {
  const { status, report } = run(repo(
    [[1, 'echo model is <model>']],
    { substitute: { '<model>': 'toy-1b' }, steps: [{ command: 1, expect: 'model is toy-1b' }] },
  ));
  assert.equal(status, 0);
  assert.equal(report.steps[0].text, 'echo model is <model>');
  assert.equal(report.steps[0].ran, 'echo model is toy-1b');
});

test('a captured group becomes a <placeholder> for later steps', () => {
  const { status, report } = run(repo(
    [[1, 'echo id=abc123'], [2, 'echo got <run>']],
    {
      steps: [
        { command: 1, expect: 'id=', capture: { name: 'run', regex: 'id=(\\w+)' } },
        { command: 2, expect: 'got abc123' },
      ],
    },
  ));
  assert.equal(status, 0);
  assert.equal(report.steps[1].ran, 'echo got abc123');
});

test('a capture whose regex matches nothing fails the step', () => {
  const { status, report } = run(repo(
    [[1, 'echo nothing here']],
    { steps: [{ command: 1, expect: 'nothing', capture: { name: 'v', regex: 'id=(\\w+)' } }] },
  ));
  assert.equal(status, 1);
  assert.match(report.steps[0].why, /capture .* matched nothing/);
});

test('a non-zero exit passes only when declared, and with its expect', () => {
  const ok = run(repo(
    [[1, 'echo the check found 0 leaks; exit 1']],
    { steps: [{ command: 1, exit: 1, expect: 'found 0 leaks' }] },
  ));
  assert.equal(ok.status, 0);

  const undeclared = run(repo(
    [[1, 'echo boom; exit 1']],
    { steps: [{ command: 1, expect: 'boom' }] },
  ));
  assert.equal(undeclared.status, 1);
  assert.match(undeclared.report.steps[0].why, /exited 1, not 0/);
});

test('an until step passes the moment its expect appears in the stream, and kills the process', () => {
  const started = Date.now();
  const { status, report } = run(repo(
    [[1, 'echo serving on 8080; sleep 600']],
    { steps: [{ command: 1, until: 30, expect: 'serving on 8080' }] },
  ));
  assert.equal(status, 0);
  assert.equal(report.steps[0].ok, true);
  assert.ok(Date.now() - started < 20000, 'the sleep was killed, not waited out');
});

test('an until step whose expect never appears fails when the time runs out', () => {
  const { status, report } = run(repo(
    [[1, 'echo warming up; sleep 600']],
    { steps: [{ command: 1, until: 3, expect: 'never printed' }] },
  ));
  assert.equal(status, 1);
  assert.match(report.steps[0].why, /the stream never matched/);
});

test('env values reach setup and steps, and versions land in the environment line', () => {
  const { status, report } = run(repo(
    [[1, 'echo endpoint is $ENDPOINT']],
    {
      env: { ENDPOINT: 'http://127.0.0.1:11434' },
      versions: ['echo tool 9.9.9'],
      steps: [{ command: 1, expect: 'endpoint is http://127\\.0\\.0\\.1:11434' }],
    },
  ));
  assert.equal(status, 0);
  assert.match(report.environment, /tool 9\.9\.9/);
});
