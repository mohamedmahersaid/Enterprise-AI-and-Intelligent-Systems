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
 *   copy      {dest: source} - repository fixtures copied in, confined to the
 *             leaf's own directory
 *   scripts   {dest: heading} - python blocks extracted from the leaf's
 *             "## Automation scripts" section, so the script that runs is the
 *             leaf's own text, never a copy; the report records each sha256
 *   setup     [{run, expect?, timeout?}] - commands run before the steps and
 *             reported separately: setup is scaffolding, never coverage
 *   env       non-secret environment values for setup and steps
 *   substitute{"<placeholder>": value} - applied to step text; the report
 *             records the leaf's text and what actually ran, side by side
 *   versions  commands whose one-line output records tool versions
 *   steps     one per command, in order: `command` is the leaf's Command
 *             number; `background` starts a server and waits for `ready` to
 *             succeed; `stdin` feeds an interactive command; `expect` is a
 *             regular expression the output must match (required, or
 *             `"expect": null` with an `expect_reason`); `exit` the expected
 *             status; `until` streams until expect matches; `capture` makes
 *             group 1 of a match available to later steps; `timeout` in
 *             seconds
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
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { checkSpec, parseCommands, scriptHeadings } from './lib/live-spec.mjs';
import { pythonBlocks } from './lib/python-blocks.mjs';

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

// The leaf's commands, by number, exactly as a reader sees them - parsed
// heading-first, and checked against the spec, by scripts/lib/live-spec.mjs.
// validate:content runs the same checks on every PR; this repeats them so a
// stale checkout still fails loudly instead of running the wrong text.
const leafBody = fs.readFileSync(leaf.path, 'utf8');
const parsed = parseCommands(leafBody, leaf.path);
const problems = [...parsed.errors, ...checkSpec(spec, parsed.commands, specPath, {
  leafDir: path.dirname(leaf.path),
  scriptNames: scriptHeadings(leafBody),
})];
if (problems.length) {
  console.error(`${specPath} does not match ${leaf.path}:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const leafCommands = parsed.commands;

const work = fs.mkdtempSync(path.join(os.tmpdir(), `live-${id}-`));
for (const [name, content] of Object.entries(spec.files ?? {})) {
  fs.writeFileSync(path.join(work, name), content);
}

// Repository fixtures, checked again here (checkSpec confines them offline):
// only paths under the leaf's own directory reach the working directory.
const leafDir = `${path.dirname(leaf.path)}/`;
for (const [dest, source] of Object.entries(spec.copy ?? {})) {
  if (!source.startsWith(leafDir) || source.includes('..')) {
    console.error(`${specPath}: copy source "${source}" escapes ${leafDir}`);
    process.exit(1);
  }
  const target = path.join(work, dest);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

// The leaf's own scripts, extracted from its Automation scripts section, so
// what runs is the text a reader sees. The report records each file's sha256.
const scriptHashes = {};
if (Object.keys(spec.scripts ?? {}).length) {
  const blocks = pythonBlocks([leaf]);
  for (const [dest, heading] of Object.entries(spec.scripts)) {
    const block = blocks.find((b) => b.name === heading);
    if (!block) {
      console.error(`${specPath}: no python block under "### ${heading}" in ${leaf.path}`);
      process.exit(1);
    }
    fs.writeFileSync(path.join(work, dest), block.code);
    scriptHashes[dest] = crypto.createHash('sha256').update(block.code).digest('hex');
  }
}

// Values every setup line and step sees. Captured variables join as they are
// produced.
const runEnv = { ...process.env, ...(spec.env ?? {}) };
const captured = {};

/** The spec's substitutions plus captured variables, applied to step text. */
function substitute(text) {
  let out = text;
  for (const [token, value] of Object.entries(spec.substitute ?? {})) out = out.replaceAll(token, value);
  for (const [name, value] of Object.entries(captured)) out = out.replaceAll(`<${name}>`, value);
  return out;
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

const probe = (check) => spawnSync('bash', ['-c', check], { cwd: work, env: runEnv }).status === 0;

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
function runForeground(text, stdin, timeoutMs, until = null) {
  return new Promise((resolve) => {
    const child = spawn('bash', [...SHELL, text], { cwd: work, env: runEnv, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    foreground.add(child);
    let output = '';
    let timedOut = false;
    let streamed = false;
    const watch = (d) => {
      output += d;
      // A streaming step passes the moment its expect appears; the process
      // (a server, a follow, a watch) is then stopped - it never exits alone.
      if (until && !streamed && until.expect.test(output)) {
        streamed = true;
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      }
    };
    child.stdout.on('data', watch);
    child.stderr.on('data', watch);
    child.stdin.on('error', () => { /* the command closed stdin early */ });
    child.stdin.end(stdin);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      foreground.delete(child);
      resolve({ status, signal, output, streamed, error: timedOut && !streamed ? { code: 'ETIMEDOUT' } : null });
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
    const child = spawn('bash', [...SHELL, text], { cwd: work, env: runEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
  const until = step.until ? { expect: new RegExp(step.expect, 'm') } : null;
  const timeout = step.until ?? step.timeout ?? 120;
  const r = await runForeground(text, step.stdin ?? '', timeout * 1000, until);
  const output = r.output;
  const matched = step.expect ? new RegExp(step.expect, 'm').test(output) : true;
  const exits = step.exit === undefined ? [0] : Array.isArray(step.exit) ? step.exit : [step.exit];
  const dead = deadServer();
  const why = until
    ? (r.streamed ? '' : `the stream never matched /${step.expect}/ within ${timeout}s`)
    : r.error?.code === 'ETIMEDOUT' ? `timed out after ${timeout}s`
      : !exits.includes(r.status) ? `exited ${r.status ?? r.signal}, not ${exits.join(' or ')}`
        : !matched ? `output did not match /${step.expect}/`
          : '';
  const late = !why && dead ? `the server from Command ${dead.command} exited (${dead.exited}) during this step` : '';
  const result = { ok: !why && !late && (until ? true : !r.error), output, why: why || late };
  if (result.ok && step.capture) {
    const m = output.match(new RegExp(step.capture.regex, 'm'));
    if (m?.[1] === undefined) {
      return { ok: false, output, why: `capture /${step.capture.regex}/ matched nothing to assign to <${step.capture.name}>` };
    }
    captured[step.capture.name] = m[1];
  }
  return result;
}

// Setup builds what the commands need - runs the leaf's script over the
// fixtures, seeds a git history - and is reported separately: scaffolding is
// never coverage, and a setup failure fails the run before any Command runs.
const setupResults = [];
let setupFailed = false;
for (const [i, s] of (spec.setup ?? []).entries()) {
  const started = Date.now();
  const r = await runForeground(s.run, '', (s.timeout ?? 300) * 1000);
  const matched = s.expect ? new RegExp(s.expect, 'm').test(r.output) : true;
  const why = r.error?.code === 'ETIMEDOUT' ? `timed out after ${s.timeout ?? 300}s`
    : r.status !== 0 ? `exited ${r.status ?? r.signal}`
      : !matched ? `output did not match /${s.expect}/`
        : '';
  const entry = { run: s.run, seconds: Math.round((Date.now() - started) / 1000), ok: !why, why, output: r.output.slice(-2000) };
  setupResults.push(entry);
  console.log(`${entry.ok ? 'pass' : 'FAIL'}  setup ${i + 1}  (${entry.seconds}s)  ${s.run.split('\n')[0]}${why ? `\n      ${why}` : ''}`);
  if (!entry.ok) {
    console.log(entry.output.split('\n').slice(-15).map((l) => `      | ${l}`).join('\n'));
    setupFailed = true;
    break;
  }
}

const results = [];
for (const step of setupFailed ? [] : spec.steps) {
  const text = leafCommands.get(step.command);
  const ran = substitute(text);
  const started = Date.now();
  const result = await runStep(step, ran);
  const entry = {
    command: step.command,
    text,
    // What actually ran, only when substitution changed the leaf's text, so a
    // reviewer sees both sides of every replacement.
    ...(ran !== text ? { ran } : {}),
    seconds: Math.round((Date.now() - started) / 1000),
    ok: result.ok,
    why: result.why,
    output: result.output.slice(-2000),
  };
  if (result.bg) result.bg.entry = entry;
  results.push(entry);
  console.log(`${entry.ok ? 'pass' : 'FAIL'}  Command ${step.command}  (${entry.seconds}s)  ${ran.split('\n')[0]}${entry.why ? `\n      ${entry.why}` : ''}`);
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
const serviceVersion = [spec.version, ...(spec.versions ?? [])].filter(Boolean).map(version).filter(Boolean).join('; ');

// A server's output keeps arriving after its step passes; record all of it.
for (const bg of background) if (bg.entry) bg.entry.output = bg.log.slice(-2000);

const passed = !setupFailed && results.length === spec.steps.length && results.every((r) => r.ok);
const ran = results.filter((r) => r.ok).map((r) => r.command);
const report = {
  leaf: id,
  // In CI, the run and commit this report is evidence of: committed as
  // data/live/runs/<leaf>-<run_id>.json, readiness.mjs cross-checks them
  // against the data/validation.json record. Absent on a local run.
  run_id: Number(process.env.GITHUB_RUN_ID) || undefined,
  head_sha: process.env.GITHUB_SHA || undefined,
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
  // Scaffolding the spec ran before the Commands - never counted as coverage.
  ...(setupResults.length ? { setup: setupResults } : {}),
  // Each extracted leaf script, hashed, so the report pins what ran.
  ...(Object.keys(scriptHashes).length ? { scripts_sha256: scriptHashes } : {}),
  steps: results,
};

const md = [
  `## Live run: ${id}`,
  '',
  `Result: **${report.result}** - ${report.covered} of ${report.planned}; environment: ${report.environment}.`,
  '',
  '| Command | Result | Seconds | Note |',
  '| --- | --- | ---: | --- |',
  ...setupResults.map((r, i) => `| setup ${i + 1} | ${r.ok ? 'pass' : 'fail'} | ${r.seconds} | ${(r.why || r.run.split('\n')[0]).replace(/\|/g, '\\|')} |`),
  ...results.map((r) => `| ${r.command} | ${r.ok ? 'pass' : 'fail'} | ${r.seconds} | ${r.why.replace(/\|/g, '\\|')} |`),
  ...Object.entries(report.skipped).map(([n, why]) => `| ${n} | skipped | | ${why.replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > -1) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(report, null, 2));

cleanup();
process.exit(passed ? 0 : 1);
