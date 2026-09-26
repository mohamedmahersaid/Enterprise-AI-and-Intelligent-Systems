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
const foreground = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// -e and pipefail, so a failing line in a multi-line block or a failing
// command early in a pipe fails the step instead of vanishing behind the
// status of the last one.
const SHELL = ['-eo', 'pipefail', '-c'];

// Servers the steps start run in their own process group; however the run
// ends - normally, on an error, or interrupted - they are stopped and the
// working directory removed, so no orphan keeps the port for the next run.
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const child of [...background.map((bg) => bg.child), ...foreground]) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  fs.rmSync(work, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

const probe = (check) => spawnSync('bash', ['-c', check], { cwd: work }).status === 0;

async function waitReady(bg, check, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (bg.exited !== undefined) return false;
    if (probe(check)) return true;
    await sleep(1000);
  }
  return false;
}

/**
 * Runs a command to completion without blocking the event loop - spawnSync
 * would, and a SIGINT or SIGTERM sent to this process during a long step would
 * then wait for the step to finish instead of stopping the run. The command
 * gets its own process group so a timeout or a signal stops all of it.
 */
function runForeground(text, stdin, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('bash', [...SHELL, text], { cwd: work, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    foreground.add(child);
    let output = '';
    let timedOut = false;
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.stdin.on('error', () => { /* the command closed stdin early */ });
    child.stdin.end(stdin);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      foreground.delete(child);
      resolve({ status, signal, output, error: timedOut ? { code: 'ETIMEDOUT' } : null });
    });
  });
}

/** A background server that has exited, or undefined if all are still up. */
const deadServer = () => background.find((bg) => bg.exited !== undefined);

async function runStep(step, text) {
  if (step.background) {
    // The probe must fail before the server starts: if something already
    // answers it, it would pass for a server that never started.
    if (probe(step.ready)) {
      return { ok: false, output: '', why: `something already answers \`${step.ready}\` - stop it first` };
    }
    const child = spawn('bash', [...SHELL, text], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const bg = { child, command: step.command, log: '', exited: undefined };
    child.stdout.on('data', (d) => (bg.log += d));
    child.stderr.on('data', (d) => (bg.log += d));
    child.on('exit', (code, signal) => (bg.exited = code ?? signal));
    background.push(bg);
    const ready = await waitReady(bg, step.ready, step.timeout ?? 60);
    await sleep(1000); // a server that binds and then dies should die here, not later
    if (bg.exited !== undefined) return { ok: false, output: bg.log, why: `exited ${bg.exited} before or just after becoming ready` };
    return { ok: ready, output: bg.log, why: ready ? '' : `not ready: ${step.ready}`, bg };
  }
  const r = await runForeground(text, step.stdin ?? '', (step.timeout ?? 120) * 1000);
  const output = r.output;
  const matched = step.expect ? new RegExp(step.expect, 'm').test(output) : true;
  const dead = deadServer();
  const why = r.error?.code === 'ETIMEDOUT' ? `timed out after ${step.timeout ?? 120}s`
    : r.status !== 0 ? `exited ${r.status ?? r.signal}`
      : !matched ? `output did not match /${step.expect}/`
        : dead ? `the server from Command ${dead.command} exited (${dead.exited}) during this step`
          : '';
  return { ok: !why && !r.error, output, why };
}

const results = [];
for (const step of spec.steps) {
  const text = leafCommands.get(step.command);
  const started = Date.now();
  const result = await runStep(step, text);
  const entry = {
    command: step.command,
    text,
    seconds: Math.round((Date.now() - started) / 1000),
    ok: result.ok,
    why: result.why,
    output: result.output.slice(-2000),
  };
  if (result.bg) result.bg.entry = entry;
  results.push(entry);
  console.log(`${entry.ok ? 'pass' : 'FAIL'}  Command ${step.command}  (${entry.seconds}s)  ${text.split('\n')[0]}${entry.why ? `\n      ${entry.why}` : ''}`);
  if (!entry.ok) {
    console.log(entry.output.split('\n').slice(-15).map((l) => `      | ${l}`).join('\n'));
    break; // later commands depend on earlier ones; stop at the first failure
  }
}

// Read while any server the steps started is still up: some clients report
// only a connection warning, not their version, when nothing is listening.
// One line, and never a warning when a real version line is present.
function version(cmd) {
  const lines = (spawnSync('bash', ['-c', cmd], { encoding: 'utf8' }).stdout ?? '')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => !/^warning/i.test(l)) ?? lines.join('; ');
}
const serviceVersion = spec.version ? version(spec.version) : '';

// A server's output keeps arriving after its step passes; record all of it.
for (const bg of background) if (bg.entry) bg.entry.output = bg.log.slice(-2000);

const passed = results.length === spec.steps.length && results.every((r) => r.ok);
const ran = results.filter((r) => r.ok).map((r) => r.command);
const report = {
  leaf: id,
  result: passed ? 'pass' : 'fail',
  // Only the commands that ran and passed: a run that stopped early must not
  // be recorded as having covered the ones it never reached.
  covered: ran.length ? `Commands ${ran.join(', ')}` : 'no command passed',
  planned: `Commands ${spec.steps.map((s) => s.command).join(', ')}`,
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
  `Result: **${report.result}** - ${report.covered} of ${report.planned}; environment: ${report.environment}.`,
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

cleanup();
process.exit(passed ? 0 : 1);
