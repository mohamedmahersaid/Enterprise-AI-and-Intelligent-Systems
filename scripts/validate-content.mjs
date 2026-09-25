import fs from 'node:fs';
import { deriveAssumptions, renderAssumptionsMd } from './lib/assumptions.mjs';
import { checkCertifications } from './lib/certifications.mjs';
import { checkReferences } from './lib/references.mjs';
import path from 'node:path';

import { slug } from './lib/derive.mjs';

const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const errors = [];

const REQUIRED_SECTIONS = [
  'Explanation',
  'Architecture and flow',
  'Commands',
  'Automation scripts',
  'Lab',
  'Operational automation',
  'Troubleshooting',
  'Interview questions',
  'Certification alignment',
  'References',
];

const FRONTMATTER_FIELDS = [
  ['id', (leaf) => leaf.id],
  ['title', (leaf) => leaf.name],
  ['level', (leaf) => leaf.level],
  ['tree', (leaf) => leaf.tree],
  ['branch', (leaf) => leaf.branch],
];

/** Split a markdown file into lines, flagging those inside fenced code blocks. */
function parseLines(content) {
  let fenced = false;
  return content.split('\n').map((text) => {
    if (text.startsWith('```')) {
      fenced = !fenced;
      return { text, fenced: true };
    }
    return { text, fenced };
  });
}

function parseFrontmatter(content, file) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push(`${file}: missing YAML frontmatter block.`);
    return null;
  }
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_]+):\s*'(.*)'\s*$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  return fields;
}

/**
 * Headings must not skip levels, and no section may be empty. An empty H2
 * followed immediately by another H2 means a subsection was written one level
 * too high, which renders as a blank heading on GitHub.
 */
function checkHeadings(lines, file) {
  const headings = [];
  lines.forEach((line, index) => {
    if (line.fenced) return;
    const match = line.text.match(/^(#{1,6}) (.+)$/);
    if (match) headings.push({ level: match[1].length, text: match[2], line: index });
  });

  for (const [i, heading] of headings.entries()) {
    const next = headings[i + 1];
    if (next && next.level > heading.level + 1) {
      errors.push(
        `${file}:${heading.line + 1}: heading level jumps from H${heading.level} to H${next.level} ("${next.text}").`
      );
    }
    if (!next) continue;
    // Only same-or-higher-level successors close a section; a deeper heading is content.
    if (next.level > heading.level) continue;
    const body = lines.slice(heading.line + 1, next.line).filter((l) => l.text.trim());
    if (body.length === 0) {
      errors.push(
        `${file}:${heading.line + 1}: empty section "${heading.text}" — ` +
          `next heading "${next.text}" is H${next.level} and should likely be H${heading.level + 1}.`
      );
    }
  }
  return headings;
}

/** Relative links must resolve. Links inside fenced code blocks are sample code, not links. */
function checkLinks(lines, file) {
  const dir = path.dirname(file);
  for (const line of lines) {
    if (line.fenced) continue;
    for (const match of line.text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const resolved = path.normalize(path.join(dir, target.split('#')[0]));
      if (!fs.existsSync(resolved)) errors.push(`${file}: broken relative link: ${target}`);
    }
  }
}

// --- catalog-level integrity -------------------------------------------------

if (catalog.leaves.length !== catalog.expectedLeafCount) {
  errors.push(`Expected ${catalog.expectedLeafCount} leaves but catalog contains ${catalog.leaves.length}.`);
}

const trees = new Set(catalog.leaves.map((l) => l.tree));
const branches = new Set(catalog.leaves.map((l) => `${l.tree}/${l.branch}`));
if (trees.size !== catalog.treeCount) {
  errors.push(`catalog.treeCount is ${catalog.treeCount} but leaves span ${trees.size} trees.`);
}
if (branches.size !== catalog.branchCount) {
  errors.push(`catalog.branchCount is ${catalog.branchCount} but leaves span ${branches.size} branches.`);
}

const actualLevels = {};
for (const leaf of catalog.leaves) actualLevels[leaf.level] = (actualLevels[leaf.level] ?? 0) + 1;
for (const level of new Set([...Object.keys(actualLevels), ...Object.keys(catalog.levelCounts)])) {
  if (actualLevels[level] !== catalog.levelCounts[level]) {
    errors.push(
      `catalog.levelCounts.${level} is ${catalog.levelCounts[level] ?? 0} but ${actualLevels[level] ?? 0} leaves have that level.`
    );
  }
}

// --- per-leaf integrity ------------------------------------------------------

const ids = new Set();
for (const leaf of catalog.leaves) {
  if (ids.has(leaf.id)) errors.push(`Duplicate leaf ID: ${leaf.id}`);
  ids.add(leaf.id);

  if (!fs.existsSync(leaf.path)) {
    errors.push(`Missing leaf file: ${leaf.path}`);
    continue;
  }

  const content = fs.readFileSync(leaf.path, 'utf8');
  const lines = parseLines(content);

  const frontmatter = parseFrontmatter(content, leaf.path);
  if (frontmatter) {
    for (const [field, expected] of FRONTMATTER_FIELDS) {
      if (frontmatter[field] !== expected(leaf)) {
        errors.push(
          `${leaf.path}: frontmatter ${field} is '${frontmatter[field] ?? ''}' but catalog says '${expected(leaf)}'.`
        );
      }
    }
  }

  const headings = checkHeadings(lines, leaf.path);
  checkLinks(lines, leaf.path);

  const h1 = headings.filter((h) => h.level === 1);
  if (h1.length !== 1) errors.push(`${leaf.path}: expected exactly 1 H1 heading, found ${h1.length}.`);
  else if (h1[0].text !== leaf.name) {
    errors.push(`${leaf.path}: H1 is "${h1[0].text}" but catalog name is "${leaf.name}".`);
  }

  const h2 = new Set(headings.filter((h) => h.level === 2).map((h) => h.text));
  for (const section of REQUIRED_SECTIONS) {
    if (!h2.has(section)) errors.push(`${leaf.path} is missing required section: ## ${section}`);
  }

  const todos = lines.filter((l) => l.text.includes('TODO:')).length;
  if (todos) {
    errors.push(`${leaf.path}: ${todos} unresolved TODO marker(s) from the scaffold - replace them before merging.`);
  }

  if (!content.includes('```mermaid')) {
    errors.push(`${leaf.path} is missing a mermaid diagram.`);
  }
}

// --- navigation files --------------------------------------------------------

function findNavFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findNavFiles(full));
    else if (entry.name === 'README.md') found.push(full);
  }
  return found;
}

const navFiles = ['README.md', 'CATALOG.md', 'PATHS.md', ...findNavFiles('docs')];
for (const file of navFiles) {
  if (!fs.existsSync(file)) continue;
  checkLinks(parseLines(fs.readFileSync(file, 'utf8')), file);
}

if (fs.existsSync('CATALOG.md')) {
  const catalogMd = fs.readFileSync('CATALOG.md', 'utf8');
  for (const leaf of catalog.leaves) {
    if (!catalogMd.includes(leaf.path)) errors.push(`CATALOG.md does not link leaf: ${leaf.path}`);
  }
}

// --- learning paths ----------------------------------------------------------

/**
 * Paths carry the editorial ordering; the leaves carry the content. These
 * checks keep the two from drifting apart in the three ways they can:
 * a path pointing at a leaf that no longer exists, a leaf that no path
 * reaches, and PATHS.md disagreeing with the catalog it is generated from.
 *
 * The orphan check is the one with teeth. Without it a leaf can be added and
 * simply never appear in any reading order - present in the catalog, invisible
 * to anyone following a path. Placing a new leaf is a decision the author
 * should have to make, so CI makes them make it.
 */
function checkPaths() {
  const paths = catalog.paths ?? [];
  if (!paths.length) {
    errors.push('data/catalog.json has no paths. Every leaf must be reachable from a reading order.');
    return;
  }

  if (catalog.pathCount !== paths.length) {
    errors.push(`catalog pathCount is ${catalog.pathCount} but there are ${paths.length} paths. Run 'npm run regen'.`);
  }

  const leafIds = new Set(catalog.leaves.map((l) => l.id));
  const reached = new Set();
  const pathIds = new Set();

  for (const p of paths) {
    for (const field of ['id', 'name', 'audience', 'summary']) {
      if (!p[field]) errors.push(`catalog path '${p.id ?? '(no id)'}' is missing '${field}'.`);
    }
    if (pathIds.has(p.id)) errors.push(`catalog has two paths with id '${p.id}'.`);
    pathIds.add(p.id);

    if (!p.steps?.length) {
      errors.push(`catalog path '${p.id}' has no steps.`);
      continue;
    }
    const seen = new Set();
    for (const [i, step] of p.steps.entries()) {
      if (!leafIds.has(step.leaf)) {
        errors.push(`catalog path '${p.id}' step ${i + 1} references unknown leaf '${step.leaf}'.`);
        continue;
      }
      if (seen.has(step.leaf)) {
        errors.push(`catalog path '${p.id}' visits leaf '${step.leaf}' twice.`);
      }
      seen.add(step.leaf);
      reached.add(step.leaf);
      if (!step.why) errors.push(`catalog path '${p.id}' step ${i + 1} ('${step.leaf}') has no 'why'.`);
    }
  }

  for (const leaf of catalog.leaves) {
    if (!reached.has(leaf.id)) {
      errors.push(
        `leaf '${leaf.id}' appears in no learning path. Add it to a path in data/catalog.json ` +
          `and run 'npm run regen'.`
      );
    }
  }

  if (!fs.existsSync('PATHS.md')) {
    errors.push("PATHS.md is missing. Run 'npm run regen'.");
    return;
  }
  const pathsMd = fs.readFileSync('PATHS.md', 'utf8');
  for (const p of paths) {
    if (!pathsMd.includes(`## ${p.name}`)) errors.push(`PATHS.md has no section for path '${p.name}'.`);
    const anchor = `#${slug(p.name)}`;
    if (!pathsMd.includes(`](${anchor})`)) {
      errors.push(`PATHS.md index does not link path '${p.name}' at '${anchor}'.`);
    }
  }
  for (const leaf of catalog.leaves) {
    if (reached.has(leaf.id) && !pathsMd.includes(leaf.path)) {
      errors.push(`PATHS.md does not link leaf '${leaf.id}', which a path references. Run 'npm run regen'.`);
    }
  }
}

checkPaths();

// --- README derived figures --------------------------------------------------

/**
 * Every number in README.md that restates the catalog is asserted here, so a
 * leaf added or moved without updating the badges fails CI instead of leaving
 * the front page quietly wrong.
 */
function checkReadme() {
  if (!fs.existsSync('README.md')) return;
  const readme = fs.readFileSync('README.md', 'utf8');
  const leafCount = catalog.leaves.length;
  const present = catalog.leaves.filter((l) => fs.existsSync(l.path)).length;
  const coverage = Math.round((present / catalog.expectedLeafCount) * 100);

  const expect = (label, re, want) => {
    const m = readme.match(re);
    if (!m) errors.push(`README.md: could not find ${label} to verify against the catalog.`);
    else if (m[1] !== String(want)) {
      errors.push(`README.md: ${label} is '${m[1]}' but the catalog gives '${want}'.`);
    }
  };

  expect('the leaves badge', /badge\/leaves-(\d+)-/, leafCount);
  expect('the coverage badge', /badge\/catalog%20coverage-(\d+)%25-/, coverage);
  expect('the coverage statement percentage', /Catalog coverage is (\d+)%/, coverage);
  expect('the coverage statement leaf count', /all (\d+) authoritative leaves/, leafCount);
  expect('the total tree count', /\*\*Total:\*\* (\d+) trees/, catalog.treeCount);
  expect('the total branch count', /\*\*Total:\*\* \d+ trees · (\d+) branches/, catalog.branchCount);
  expect('the total leaf count', /\*\*Total:\*\* \d+ trees · \d+ branches · (\d+) leaves/, leafCount);

  const levels = Object.keys(catalog.levelCounts).sort()
    .map((k) => `${k}: ${catalog.levelCounts[k]}`).join(' · ');
  expect('the level distribution', /\*\*Level distribution:\*\* (.+)/, levels);

  // curriculum map: one row per tree, with its branch and leaf counts
  const perTree = new Map();
  for (const leaf of catalog.leaves) {
    if (!perTree.has(leaf.tree)) perTree.set(leaf.tree, { branches: new Set(), leaves: 0 });
    const t = perTree.get(leaf.tree);
    t.branches.add(leaf.branch);
    t.leaves += 1;
  }
  for (const [tree, t] of perTree) {
    const row = readme.match(
      new RegExp(`^\\| \\[${tree.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\([^)]+\\) \\| (\\d+) \\| (\\d+) \\|$`, 'm')
    );
    if (!row) errors.push(`README.md: curriculum map has no row for tree '${tree}'.`);
    else if (row[1] !== String(t.branches.size) || row[2] !== String(t.leaves)) {
      errors.push(
        `README.md: curriculum map row '${tree}' says ${row[1]} branches / ${row[2]} leaves ` +
          `but the catalog gives ${t.branches.size} / ${t.leaves}.`
      );
    }
  }
}

checkReadme();

// --- version assumptions -----------------------------------------------------

/**
 * ASSUMPTIONS.md is derived from the leaf bodies, so editing a command can
 * silently invalidate it. Re-deriving and comparing is the same contract
 * PATHS.md has: the generated file is checked, never trusted.
 *
 * This asserts the document is in step. It cannot assert the assumptions are
 * still true - that needs a vendor, not a build step - and the document says
 * so itself rather than implying a validation that never happened.
 */
function checkAssumptions() {
  if (!fs.existsSync('ASSUMPTIONS.md')) {
    errors.push("ASSUMPTIONS.md is missing. Run 'npm run regen'.");
    return;
  }
  const expected = renderAssumptionsMd(deriveAssumptions(catalog));
  if (fs.readFileSync('ASSUMPTIONS.md', 'utf8') !== expected) {
    errors.push(
      "ASSUMPTIONS.md disagrees with the leaves it is derived from. A command " +
        "or a pinned version changed. Run 'npm run regen'."
    );
  }
}

checkAssumptions();

// --- certifications ----------------------------------------------------------

// Retired exams and unregistered credentials; see scripts/lib/certifications.mjs.
errors.push(...checkCertifications(catalog));

// --- references ----------------------------------------------------------------

// Every reference links its source; see scripts/lib/references.mjs.
errors.push(...checkReferences(catalog));

// --- runner parity -----------------------------------------------------------

/**
 * Every `validate:*` npm script must be invoked by BOTH runners: the CI
 * workflow and run.bat.
 *
 * This check exists because adding validate:commands did not add it to CI. The
 * workflow enumerates each step individually rather than calling `npm run
 * validate`, so a new step is silently absent and the build still reports
 * success - a check that does not run is indistinguishable from a check that
 * passes. run.bat had the same shape and was caught by hand; the workflow was
 * not.
 *
 * It lives here, in a script CI already runs, rather than in a new script of
 * its own - a parity check that can itself be left out of CI would reproduce
 * the bug it exists to prevent.
 */
function checkRunnerParity() {
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  const gates = Object.keys(scripts).filter((n) => n.startsWith('validate:'));

  const runners = [
    { file: '.github/workflows/validate.yml', label: 'the CI workflow' },
    { file: 'run.bat', label: 'run.bat' },
  ];

  for (const { file, label } of runners) {
    if (!fs.existsSync(file)) {
      errors.push(`${file} is missing, so runner parity cannot be checked.`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    for (const gate of gates) {
      if (!text.includes(gate)) {
        errors.push(
          `${file}: ${label} never runs \`${gate}\`. A gate absent from a runner ` +
            'reports success without checking anything - add the step or remove the script.'
        );
      }
    }
  }
}

checkRunnerParity();

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} validation error(s).`);
  process.exit(1);
}

console.log(
  `Validated ${catalog.leaves.length} leaves across ${catalog.treeCount} trees and ${catalog.branchCount} branches.`
);
console.log(
  'Checks: catalog counts, frontmatter/catalog agreement, heading hierarchy, required sections,\n'+
  '        mermaid fences, unresolved scaffold TODOs, relative links, CATALOG.md coverage,\n'+
  '        learning paths (every leaf reachable, no dangling step, PATHS.md in step),\n'+
  '        README badges and curriculum map, version assumptions in step,\n'+
  '        certifications (none retired, every one registered), references (each links its source),\n'+
  '        runner parity (every gate runs in CI and run.bat).'
);
