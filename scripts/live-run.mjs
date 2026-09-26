/**
 * Runs a leaf's own commands against the live service and records what they did.
 *
 * Every other gate reads the leaves; none of them runs a command. A flag can be
 * renamed, a default changed or a model withdrawn and every offline check still
 * passes. This executes the commands a reader would copy - taken from the leaf
 * text itself, not from a second copy that could drift from it - and checks
 * each against an expectation, so the readiness level `validated` can rest on
 * a run rather than on a claim.
 *
 * What to run, and how, lives in data/live/<leaf-id>.json:
 *
 *   files     fixtures the commands expect in their working directory - the
 *             Modelfile the lab has the reader write, for example
 *   steps     one per command, in order: `command` is the leaf's Command
 *             number; `background` starts a server and waits for `ready` to
 *             succeed; `stdin` feeds an interactive command; `expect` is a
 *             regular expression the output must match; `timeout` in seconds
 *   skip      every Command the steps do not run, each with the reason
 *
 * Every Command in the leaf must be either run or skipped with a reason, so a
 * command added to the leaf cannot silently go untested.
 *
 * This executes code from the repository under review, the same trust
 * validate:scripts extends, and must run only in a job that holds no write
 * token and no secrets.
 *
 * Usage: node scripts/live-run.mjs <leaf-id> [--json report.json]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const id = process.argv[2];
if (!id || id.startsWith('--')) {
  console.error('usage: node scripts/live-run.mjs <leaf-id> [--json report.json]');
  process.exit(2);
}
const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const leaf = catalog.leaves.find((l) => l.id === id);
const specPath = `data/live/${id}.json`;
if (!leaf || !fs.existsSync(specPath)) {
  console.error(`no leaf ${id} in the catalog, or no ${specPath}`);
  process.exit(2);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

/** The leaf's commands, by number, exactly as a reader sees them. */
function commands(body) {
  const out = new Map();
  const section = body.split('\n## Commands')[1]?.split('\n## ')[0] ?? '';
  for (const m of section.matchAll(/^### Command (\d+)\n[\s\S]*?```text\n([\s\S]*?)```/gm)) {
    out.set(Number(m[1]), m[2].trimEnd());
  }
  return out;
}

const leafCommands = commands(fs.readFileSync(leaf.path, 'utf8'));
const planned = new Set(spec.steps.map((s) => s.command));
const skipped = new Set(Object.keys(spec.skip ?? {}).map(Number));
const problems = [];
for (const n of leafCommands.keys()) {
  if (!planned.has(n) && !skipped.has(n)) problems.push(`Command ${n} is neither run nor skipped with a reason.`);
}
for (const n of [...planned, ...skipped]) {
  if (!leafCommands.has(n)) problems.push(`the spec names Command ${n}, which the leaf does not have.`);
}
if (problems.length) {
  console.error(`${specPath} does not match ${leaf.path}:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), `live-${id}-`));
for (const [name, content] of Object.entries(spec.files ?? {})) {
  fs.writeFileSync(path.join(work, name), content);
}

const background = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(check, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (spawnSync('bash', ['-c', check], { cwd: work }).status === 0) return true;
    await sleep(1000);
  }
  return false;
}

const results = [];
for (const step of spec.steps) {
  const text = leafCommands.get(step.command);
  const started = Date.now();
  let result;
  if (step.background) {
    const child = spawn('bash', ['-c', text], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    background.push(child);
    const ready = await waitReady(step.ready, step.timeout ?? 60);
    result = { exit: ready ? 0 : 1, output: log, ok: ready, why: ready ? '' : `not ready: ${step.ready}` };
  } else {
    const r = spawnSync('bash', ['-c', text], {
      cwd: work,
      input: step.stdin ?? '',
      encoding: 'utf8',
      timeout: (step.timeout ?? 120) * 1000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const matched = step.expect ? new RegExp(step.expect, 'm').test(output) : true;
    const ok = r.status === 0 && matched && !r.error;
    const why = r.error?.code === 'ETIMEDOUT' ? `timed out after ${step.timeout ?? 120}s`
      : r.status !== 0 ? `exited ${r.status ?? r.signal}`
        : matched ? '' : `output did not match /${step.expect}/`;
    result = { exit: r.status, output, ok, why };
  }
  const entry = {
    command: step.command,
    text,
    seconds: Math.round((Date.now() - started) / 1000),
    ok: result.ok,
    why: result.why,
    output: result.output.slice(-2000),
  };
  results.push(entry);
  console.log(`${entry.ok ? 'pass' : 'FAIL'}  Command ${step.command}  (${entry.seconds}s)  ${text.split('\n')[0]}${entry.why ? `\n      ${entry.why}` : ''}`);
  if (!entry.ok) {
    console.log(entry.output.split('\n').slice(-15).map((l) => `      | ${l}`).join('\n'));
    break; // later commands depend on earlier ones; stop at the first failure
  }
}

// Read while any server the steps started is still up: some clients report
// only a connection warning, not their version, when nothing is listening.
const version = (cmd) => spawnSync('bash', ['-c', cmd], { encoding: 'utf8' }).stdout?.trim() ?? '';
const serviceVersion = spec.version ? version(spec.version) : '';

for (const child of background) {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
}

const passed = results.length === spec.steps.length && results.every((r) => r.ok);
const report = {
  leaf: id,
  result: passed ? 'pass' : 'fail',
  covered: `Commands ${spec.steps.map((s) => s.command).join(', ')}`,
  skipped: spec.skip ?? {},
  environment: [
    process.env.ImageOS && `${process.env.ImageOS} ${process.env.ImageVersion ?? ''}`.trim(),
    serviceVersion,
  ].filter(Boolean).join(', ') || os.platform(),
  steps: results,
};

const md = [
  `## Live run: ${id}`,
  '',
  `Result: **${report.result}** - ${report.covered}; environment: ${report.environment}.`,
  '',
  '| Command | Result | Seconds | Note |',
  '| --- | --- | ---: | --- |',
  ...results.map((r) => `| ${r.command} | ${r.ok ? 'pass' : 'fail'} | ${r.seconds} | ${r.why.replace(/\|/g, '\\|')} |`),
  ...Object.entries(report.skipped).map(([n, why]) => `| ${n} | skipped | | ${why.replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > -1) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(report, null, 2));

fs.rmSync(work, { recursive: true, force: true });
process.exit(passed ? 0 : 1);
