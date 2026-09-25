/**
 * Runs every ```python block the way a reader first will: copied into an empty
 * directory and started with no arguments.
 *
 * validate-python proves the blocks parse. That is not the same as working:
 * seven shipped scripts parsed cleanly and then died with a traceback the
 * moment they were started - an IndexError for a missing argument, a KeyError
 * for an unset variable, a FileNotFoundError for a file the leaf never
 * mentioned. A reader cannot tell a traceback like that from a broken script.
 *
 * So the contract checked here is narrow and deliberate: started bare, a
 * script either runs to completion or stops with a message of its own - a
 * usage line, the variable to set. A Python traceback is a failure, because it
 * means the script's author did not anticipate the most common first run.
 *
 * A script whose declared dependency is not installed cannot be judged, and is
 * reported as skipped by name rather than passed: a check that silently skips
 * reads as coverage it did not provide. validate-python separately ensures
 * every such dependency is declared. Set LEAF_PYTHON to an interpreter that
 * has them (CI installs scripts/requirements.txt) to run more of the corpus.
 *
 * This executes code, so it is contained, not sandboxed: each script runs in a
 * throwaway directory with an empty stdin, a stripped environment (no proxy
 * settings, no credentials, HOME pointed at the throwaway directory) and a
 * timeout. It runs only code already in the repository under review, the same
 * trust a test suite gets.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PYTHON, pythonBlocks } from './lib/python-blocks.mjs';

const TIMEOUT_MS = 30_000;
const TRACEBACK = 'Traceback (most recent call last)';

const { leaves } = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));

let blocks;
try {
  blocks = pythonBlocks(leaves);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Zero blocks means the extraction broke, not that everything passed.
if (!blocks.length) {
  console.error('No python blocks found - the extraction is broken, not the corpus clean.');
  process.exit(1);
}

const probe = spawnSync(PYTHON, ['--version'], { encoding: 'utf8' });
if (probe.error) {
  // Failing loudly rather than skipping, as validate-python does.
  console.error(
    `${PYTHON} could not be started (${probe.error.code}), so the scripts could not be run.\n` +
    'Install Python 3, or set LEAF_PYTHON to an interpreter, and re-run.'
  );
  process.exit(1);
}

function run(block) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leaf-script-'));
  try {
    const script = path.join(dir, 'script.py');
    fs.writeFileSync(script, block.code);
    const result = spawnSync(PYTHON, ['-I', script], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
      env: {
        PATH: process.env.PATH,
        HOME: dir,
        LANG: 'C.UTF-8',
        PYTHONDONTWRITEBYTECODE: '1',
        // Windows Python cannot initialise without SYSTEMROOT; it is not a secret.
        ...(process.env.SYSTEMROOT && { SYSTEMROOT: process.env.SYSTEMROOT }),
      },
    });
    const output = `${result.stdout}${result.stderr}`.trim();
    if (result.error?.code === 'ETIMEDOUT') {
      return { verdict: 'fail', why: `still running after ${TIMEOUT_MS / 1000}s with no input` };
    }
    if (result.status === 0) return { verdict: 'ran' };
    const missing = result.stderr.match(/ModuleNotFoundError: No module named '([^'.]+)/);
    if (missing && result.stderr.includes(TRACEBACK)) {
      return { verdict: 'skip', module: missing[1] };
    }
    if (result.stderr.includes(TRACEBACK)) {
      const last = result.stderr.trim().split('\n').at(-1);
      return { verdict: 'fail', why: `traceback instead of a message: ${last}` };
    }
    if (!output) {
      return { verdict: 'fail', why: `exited ${result.status ?? result.signal} without saying why` };
    }
    return { verdict: 'refused', message: output.split('\n').at(-1) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --verbose prints every outcome, so a reviewer can read what each script said.
const verbose = process.argv.includes('--verbose');
const counts = { ran: 0, refused: 0, skip: 0, fail: 0 };
const skipped = [];
for (const block of blocks) {
  const outcome = run(block);
  counts[outcome.verdict]++;
  const where = `${block.file}:${block.offset} ${block.name || 'python block'}`;
  if (verbose && outcome.verdict !== 'fail') {
    const detail = outcome.message ?? (outcome.module ? `needs ${outcome.module}` : '');
    console.log(`${outcome.verdict.padEnd(7)} ${where}${detail ? `\n        ${detail}` : ''}`);
  }
  if (outcome.verdict === 'fail') {
    console.error(`${where}\n    ${outcome.why}`);
  } else if (outcome.verdict === 'skip') {
    skipped.push(`${block.name || block.file} (needs ${outcome.module})`);
  }
}

console.log(
  `Ran ${blocks.length} python blocks with ${probe.stdout.trim() || PYTHON}: ` +
  `${counts.ran} completed, ${counts.refused} stopped with their own message, ` +
  `${counts.skip} skipped, ${counts.fail} failed.`
);
if (skipped.length) {
  console.log(`Skipped, dependency not installed here: ${skipped.join(', ')}.`);
}

if (counts.fail) {
  console.error(`\n${counts.fail} script(s) crashed on a bare first run.`);
  process.exit(1);
}
