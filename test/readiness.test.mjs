import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkReadiness,
  checkReadinessLine,
  commandTools,
  coveredCommands,
  impliedNeeds,
  latestRuns,
  leafCommandCount,
  needsSentence,
  readinessLine,
} from '../scripts/lib/readiness.mjs';

// checkReadiness resolves workflow and leaf paths against the working
// directory, as the validators do when run from the repository root.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const REPO = 'owner/repo';
const TODAY = '2026-01-31';
const RUN_URL = `https://github.com/${REPO}/actions/runs/200`;
const LEAF_PATH = 'docs/tree/branch/no-such-leaf.md';
const SHA = 'f'.repeat(40);

const leaf = (over = {}) => ({ id: 'leaf-a', path: LEAF_PATH, readiness: 'lab', needs: ['runner'], ...over });
const run = (over = {}) => ({
  leaf: 'leaf-a',
  date: '2026-01-10',
  workflow: '.github/workflows/validate.yml',
  run: RUN_URL,
  run_id: 200,
  head_sha: SHA,
  event: 'schedule',
  head_branch: 'main',
  environment: 'ubuntu-24.04',
  covered: 'Command 1',
  result: 'pass',
  ...over,
});
// The committed run report a validated leaf's record must agree with.
const report = (over = {}) => ({
  leaf: 'leaf-a',
  run_id: 200,
  result: 'pass',
  covered: 'Command 1',
  steps: [{ command: 1, ok: true }],
  ...over,
});
/** A temporary runs directory holding the given reports, named as committed. */
const dirWith = (...reports) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-runs-'));
  for (const r of reports) fs.writeFileSync(path.join(dir, `${r.leaf}-${r.run_id}.json`), JSON.stringify(r));
  return dir;
};
const GOOD_RUNS = dirWith(report());
const check = (leaves, runs = [], runsDir = GOOD_RUNS) => checkReadiness({ leaves }, { runs }, REPO, TODAY, runsDir);
const fence = (label, ...lines) => ['```' + label, ...lines, '```'].join('\n');

test('impliedNeeds finds a tool anywhere in a command line', () => {
  const cases = [
    ['az login', ['azure']],
    ['sudo az login', ['azure']],
    ['X=1 kubectl get pods', ['kubernetes']],
    ['cat f.yaml | kubectl apply -f -', ['kubernetes']],
    ['echo $(nvidia-smi -L)', ['gpu']],
    ['/usr/bin/kubectl get nodes', ['kubernetes']],
    ['kubectl.exe get nodes', ['kubernetes']],
    ['$ ollama pull llama3', ['ollama']],
    ['make build && sbatch job.sh', ['slurm']],
    ['env FOO=1 helm install x y', ['kubernetes']],
  ];
  for (const [line, want] of cases) {
    assert.deepEqual(impliedNeeds(fence('text', line)), want, line);
  }
});

test('impliedNeeds reads every shell-capable fence, and no code fence', () => {
  assert.deepEqual(impliedNeeds(fence('bash', 'az login')), ['azure']);
  assert.deepEqual(impliedNeeds(fence('powershell', 'az login')), ['azure']);
  assert.deepEqual(impliedNeeds(fence('', 'az login')), ['azure']);
  assert.deepEqual(impliedNeeds('~~~text\naz login\n~~~'), ['azure']);
  assert.deepEqual(impliedNeeds(fence('python', 'az login')), []);
  assert.deepEqual(impliedNeeds(fence('yaml', 'kubectl: 1')), []);
});

test('impliedNeeds ignores prose, comments and unknown tools', () => {
  assert.deepEqual(impliedNeeds('Run az login first.\n'), []);
  assert.deepEqual(impliedNeeds(fence('text', '# az login', 'curl https://example.com')), []);
});

test('impliedNeeds returns needs in canonical order, once each', () => {
  const body = fence('text', 'kubectl get pods', 'az login', 'ollama list', 'helm list', 'nvidia-smi');
  assert.deepEqual(impliedNeeds(body), ['ollama', 'gpu', 'azure', 'kubernetes']);
});

test('commandTools lists every tool a line runs', () => {
  assert.deepEqual([...commandTools(fence('text', 'sudo az login; cat f | jq .'))].sort(), ['az', 'cat', 'jq']);
});

test('needsSentence joins needs into one sentence', () => {
  assert.equal(needsSentence(['runner']), 'A live run needs only a stock CI runner.');
  assert.equal(
    needsSentence(['gpu', 'azure', 'kubernetes']),
    'A live run needs an NVIDIA GPU, an Azure subscription and a Kubernetes cluster.',
  );
});

test('readinessLine for a lab leaf links READINESS.md relative to the leaf', () => {
  assert.equal(
    readinessLine(leaf({ needs: ['azure'] })),
    '**Readiness:** [Lab](../../../READINESS.md#lab) - checked offline, not yet run against a live service. ' +
      'A live run needs an Azure subscription.',
  );
});

test('readinessLine for a validated leaf cites its run', () => {
  assert.equal(
    readinessLine(leaf({ readiness: 'validated' }), run()),
    `**Readiness:** [Validated](../../../READINESS.md#validated) - run live on 2026-01-10 ([evidence](${RUN_URL})).`,
  );
});

test('latestRuns orders by date, then by run id', () => {
  const runs = [
    run({ date: '2026-01-10', run: `https://github.com/${REPO}/actions/runs/300`, result: 'fail' }),
    run({ date: '2026-01-10', run: `https://github.com/${REPO}/actions/runs/200`, result: 'pass' }),
    run({ date: '2026-01-09', run: `https://github.com/${REPO}/actions/runs/900`, result: 'pass' }),
  ];
  assert.equal(latestRuns({ runs }).get('leaf-a').result, 'fail');
});

test('checkReadiness passes a consistent lab leaf and a validated leaf with a passing run', () => {
  assert.deepEqual(check([leaf()]), []);
  assert.deepEqual(check([leaf({ readiness: 'validated', needs: ['ollama'] })], [run()]), []);
});

test('checkReadiness rejects bad levels and needs lists', () => {
  const cases = [
    [leaf({ readiness: 'production' }), /readiness "production" is not one of lab, validated/],
    [leaf({ needs: [] }), /has no "needs"/],
    [leaf({ needs: ['cloud'] }), /needs cloud, which is not one of/],
    [leaf({ needs: ['azure', 'gpu'] }), /needs should read \[gpu, azure\]/],
    [leaf({ needs: ['runner', 'azure'] }), /lists runner alongside other needs/],
  ];
  for (const [bad, want] of cases) {
    assert.match(check([bad]).join('\n'), want);
  }
});

test('checkReadiness ties the level to the latest run', () => {
  assert.match(check([leaf({ readiness: 'validated' })]).join('\n'), /is validated, but .* records no run for it/);
  assert.match(
    check([leaf({ readiness: 'validated' })], [run({ result: 'fail' })]).join('\n'),
    /records its latest run on 2026-01-10 as fail/,
  );
  assert.match(check([leaf()], [run()]).join('\n'), /is lab, but .* records a passing run on 2026-01-10/);
});

test('checkReadiness rejects incomplete or implausible run records', () => {
  const cases = [
    [run({ environment: '' }), /has no "environment"/],
    [run({ leaf: 'leaf-b' }), /names no leaf in the catalog/],
    [run({ date: '2026-02-01' }), /date "2026-02-01" is after today \(2026-01-31\)/],
    [run({ date: '2026-02-30' }), /is not a calendar date/],
    [run({ date: '10/01/2026' }), /is not YYYY-MM-DD/],
    [run({ workflow: 'ci.yml' }), /is not a file under \.github\/workflows\//],
    [run({ workflow: '.github/workflows/no-such-workflow.yml' }), /does not exist/],
    [run({ run: 'https://github.com/someone/else/actions/runs/1' }), /is not a run URL in owner\/repo/],
    [run({ result: 'ok' }), /is neither pass nor fail/],
  ];
  for (const [bad, want] of cases) {
    assert.match(check([leaf({ readiness: 'validated' })], [bad]).join('\n'), want);
  }
});

test('checkReadiness rejects a record whose structured run fields do not hold together', () => {
  const cases = [
    // A fake run URL: the URL and run_id must name the same run.
    [run({ run: `https://github.com/${REPO}/actions/runs/999` }), /run URL names run 999, not its run_id 200/],
    [run({ run_id: undefined }), /has no "run_id"/],
    [run({ run_id: '200' }), /run_id "200" is not a positive integer/],
    [run({ head_sha: 'be50a13' }), /head_sha "be50a13" is not a 40-character lowercase commit SHA/],
    // A pull_request run executed the pull request's own spec: not evidence.
    [run({ event: 'pull_request' }), /event "pull_request" cannot back a validated claim/],
    [run({ head_branch: 'feature' }), /head_branch "feature" is not main/],
  ];
  for (const [bad, want] of cases) {
    assert.match(check([leaf({ readiness: 'validated' })], [bad]).join('\n'), want);
  }
});

test('checkReadiness requires the committed run report to exist and agree', () => {
  const validated = [leaf({ readiness: 'validated' })];
  const disagree = (r) => check(validated, [run()], dirWith(r)).join('\n');

  assert.match(check(validated, [run()], dirWith()).join('\n'), /no committed run report .*leaf-a-200\.json/);
  assert.match(disagree(report({ result: 'fail' })), /says result "fail", but the record says "pass"/);
  assert.match(disagree(report({ run_id: 201 })), /no committed run report/); // named for its own run, so it is missing
  assert.match(disagree(report({ covered: 'Commands 1, 2' })), /says covered "1, 2", but the record says "1"/);
  const wrongLeaf = dirWith();
  fs.writeFileSync(path.join(wrongLeaf, 'leaf-a-200.json'), JSON.stringify(report({ leaf: 'leaf-b' })));
  assert.match(check(validated, [run()], wrongLeaf).join('\n'), /says leaf "leaf-b", but the record says "leaf-a"/);
  const notJson = dirWith();
  fs.writeFileSync(path.join(notJson, 'leaf-a-200.json'), '{');
  assert.match(check(validated, [run()], notJson).join('\n'), /is not valid JSON/);
});

test('checkReadiness lets only a reconstructed report, with a reason, omit its steps', () => {
  const validated = [leaf({ readiness: 'validated' })];
  const withReport = (r) => check(validated, [run()], dirWith(r));

  assert.match(withReport(report({ steps: [] })).join('\n'), /records no steps/);
  assert.match(
    withReport(report({ steps: undefined, reconstructed: true })).join('\n'),
    /marked reconstructed without a reason/,
  );
  assert.deepEqual(withReport(report({ steps: undefined, reconstructed: true, reason: 'artifact expired' })), []);
});

test('checkReadiness enforces the floor: a run must cover at least half the leaf Commands', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-leaf-'));
  const leafPath = path.join(dir, 'leaf.md');
  const commands = [1, 2, 3, 4].flatMap((n) => [`### Command ${n}`, '', '```text', 'echo hi', '```', '']);
  fs.writeFileSync(leafPath, ['# A', '', '## Commands', '', ...commands].join('\n'));
  const l = leaf({ readiness: 'validated', path: leafPath });

  const thin = run({ covered: 'Commands 1' });
  assert.match(
    check([l], [thin], dirWith(report({ covered: 'Commands 1' }))).join('\n'),
    /covered 1 of the leaf's 4 Commands, below the floor of half/,
  );
  const enough = run({ covered: 'Commands 1, 3' });
  assert.deepEqual(check([l], [enough], dirWith(report({ covered: 'Commands 1, 3' }))), []);
});

test('coveredCommands reads the leading command list, however the sentence continues', () => {
  assert.deepEqual(coveredCommands('Commands 1, 2, 10, run as the spec describes; Command 9 skipped'), [1, 2, 10]);
  assert.deepEqual(coveredCommands('Command 1'), [1]);
  assert.deepEqual(coveredCommands('no command passed'), []);
  assert.deepEqual(coveredCommands(undefined), []);
});

test('leafCommandCount counts the "### Command N" headings', () => {
  assert.equal(leafCommandCount('### Command 1\n\n### Command 2\n\ntext ### Command 3\n'), 2);
  assert.equal(leafCommandCount('no commands here'), 0);
});

test('the real migrated record passes checkReadiness offline', () => {
  const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
  const validation = JSON.parse(fs.readFileSync('data/validation.json', 'utf8'));
  assert.deepEqual(checkReadiness(catalog, validation), []);
});

test('checkReadinessLine accepts the exact line under the title and rejects drift', () => {
  const l = leaf();
  const want = readinessLine(l);
  const body = (line) => ['---', 'title: A', '---', '', '# A', '', '**Forest:** x', line, '', '## Overview', ''].join('\n');
  const validation = { runs: [] };

  assert.equal(checkReadinessLine(l, body(want), validation), null);
  assert.match(checkReadinessLine(l, body('**Readiness:** Lab'), validation), /:8 readiness line reads/);
  assert.match(checkReadinessLine(l, body(''), validation), /has no readiness line in the header block/);
  assert.match(
    checkReadinessLine(l, body(want) + `\n${want}\n`, validation),
    /has 2 readiness lines \(lines 8, 12\)/,
  );
  // One inside a code fence is not the leaf's claim, and does not count twice.
  assert.equal(checkReadinessLine(l, body(want) + `\n${fence('text', want)}\n`, validation), null);
});

test('checkReadinessLine defers to checkReadiness when the level or needs are unknown', () => {
  assert.equal(checkReadinessLine(leaf({ readiness: 'nope' }), '', { runs: [] }), null);
  assert.equal(checkReadinessLine(leaf({ needs: [] }), '', { runs: [] }), null);
});
