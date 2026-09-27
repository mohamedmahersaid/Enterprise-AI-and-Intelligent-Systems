import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * `npm run validate:regen` (scripts/regenerate.mjs --check) against a copy of
 * the repository itself: clean, it passes; a hand edit to any generated file
 * fails and names the file. A copy, because the check must be shown failing,
 * and the working tree is not the place to break things.
 */
const script = path.resolve('scripts/regenerate.mjs');

function repoCopy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regen-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const entry of ['data', 'docs', '.github', 'README.md', 'CATALOG.md', 'PATHS.md', 'READINESS.md', 'ASSUMPTIONS.md']) {
    fs.cpSync(entry, path.join(dir, entry), { recursive: true });
  }
  return dir;
}

const check = (cwd) => spawnSync(process.execPath, [script, '--check'], { cwd, encoding: 'utf8' });

test('a clean tree passes the regeneration check', (t) => {
  const result = check(repoCopy(t));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /in step with data\/catalog\.json/);
});

test('a hand edit to CATALOG.md or a branch README fails and names the file', (t) => {
  const dir = repoCopy(t);
  fs.appendFileSync(path.join(dir, 'CATALOG.md'), 'hand edit\n');
  const branchReadme = fs.readdirSync(path.join(dir, 'docs'), { recursive: true })
    .map(String).find((f) => f.endsWith(`${path.sep}README.md`) && f.split(path.sep).length === 3);
  fs.appendFileSync(path.join(dir, 'docs', branchReadme), 'Beginer\n');

  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CATALOG\.md/);
  assert.ok(result.stderr.includes(`docs/${branchReadme.split(path.sep).join('/')}`), result.stderr);
});

test('a catalog edit without regeneration fails on the derived files', (t) => {
  const dir = repoCopy(t);
  const catalogPath = path.join(dir, 'data/catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  catalog.leaves[0].level = 'Expert';
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const result = check(dir);
  assert.equal(result.status, 1);
  // The recount changes levelCounts, so the catalog itself drifts, and the
  // README's level distribution with it.
  assert.match(result.stderr, /data\/catalog\.json/);
  assert.match(result.stderr, /README\.md/);
});
