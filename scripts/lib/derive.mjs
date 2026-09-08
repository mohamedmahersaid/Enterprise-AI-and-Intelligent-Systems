/**
 * Single source of truth for every file derived from data/catalog.json:
 * CATALOG.md, the README curriculum map and figures, and the tree and branch
 * READMEs. validate-content.mjs asserts these agree with the catalog; this
 * module is what makes them agree, so a leaf can be added without hand-editing
 * six navigation files and getting one of them subtly wrong.
 */
import fs from 'node:fs';
import path from 'node:path';

export const CATALOG_PATH = 'data/catalog.json';

export function readCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

export function writeCatalog(catalog) {
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

/** tree -> branch -> leaves, preserving catalog order throughout. */
export function group(catalog) {
  const trees = new Map();
  for (const leaf of catalog.leaves) {
    if (!trees.has(leaf.tree)) trees.set(leaf.tree, new Map());
    const branches = trees.get(leaf.tree);
    if (!branches.has(leaf.branch)) branches.set(leaf.branch, []);
    branches.get(leaf.branch).push(leaf);
  }
  return trees;
}

/** Recompute the counts the catalog carries about itself. */
export function recount(catalog) {
  catalog.expectedLeafCount = catalog.leaves.length;
  catalog.treeCount = new Set(catalog.leaves.map((l) => l.tree)).size;
  catalog.branchCount = new Set(catalog.leaves.map((l) => `${l.tree}/${l.branch}`)).size;
  const levels = {};
  for (const leaf of catalog.leaves) levels[leaf.level] = (levels[leaf.level] ?? 0) + 1;
  catalog.levelCounts = Object.fromEntries(Object.keys(levels).sort().map((k) => [k, levels[k]]));
  return catalog;
}

const dirOf = (leaves) => path.dirname(leaves[0].path);
const treeDirOf = (leaves) => leaves[0].path.split('/').slice(0, 2).join('/');

function writeBranchReadmes(trees) {
  for (const [tree, branches] of trees) {
    for (const [branch, leaves] of branches) {
      const rows = leaves.map((l) => `| ${l.level} | [${l.name}](${l.id}.md) |`).join('\n');
      fs.writeFileSync(`${dirOf(leaves)}/README.md`,
`# ${branch}

**Tree:** [${tree}](../README.md)
**Forest:** [AI & Intelligent Systems](../../../README.md)

| Level | Leaf |
| --- | --- |
${rows}
`);
    }
  }
}

function writeTreeReadmes(trees) {
  for (const [, branches] of trees) {
    const first = [...branches.values()][0];
    const file = `${treeDirOf(first)}/README.md`;
    const list = [...branches].map(([branch, leaves]) =>
      `- [${branch}](${path.basename(dirOf(leaves))}/README.md) — ${leaves.length} leaves`).join('\n');
    // Keep the tree's own heading and description; replace only the branch list.
    const existing = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, existing.replace(/(## Branches\n\n)[\s\S]*$/, `$1${list}\n`));
  }
}

function writeCatalogMd(catalog, trees) {
  const existing = fs.readFileSync('CATALOG.md', 'utf8');
  // Preserve each tree's prose description, which lives only in CATALOG.md.
  const descriptions = new Map();
  for (const m of existing.matchAll(/^## (.+?)\n(.*?)(?=^### )/gms)) {
    descriptions.set(m[1].trim(), m[2].trim());
  }
  const out = [existing.split('\n## ')[0].trimEnd()];
  for (const [tree, branches] of trees) {
    const description = descriptions.get(tree);
    if (description === undefined) {
      throw new Error(`CATALOG.md has no description for tree '${tree}'. Add its "## ${tree}" section with a description paragraph before regenerating.`);
    }
    out.push(`\n## ${tree}\n\n${description}`);
    for (const [branch, leaves] of branches) {
      out.push(`\n### ${branch}\n`);
      for (const l of leaves) out.push(`- **${l.level}:** [${l.name}](${l.path})`);
    }
  }
  fs.writeFileSync('CATALOG.md', `${out.join('\n')}\n`);
}

function writeReadme(catalog, trees) {
  let readme = fs.readFileSync('README.md', 'utf8');
  const leafCount = catalog.leaves.length;
  const present = catalog.leaves.filter((l) => fs.existsSync(l.path)).length;
  const coverage = Math.round((present / catalog.expectedLeafCount) * 100);

  const rows = [...trees].map(([tree, branches]) => {
    const leaves = [...branches.values()].flat();
    return `| [${tree}](${treeDirOf([...branches.values()][0])}/README.md) | ${branches.size} | ${leaves.length} |`;
  }).join('\n');

  const levels = Object.entries(catalog.levelCounts).map(([k, v]) => `${k}: ${v}`).join(' · ');

  readme = readme
    .replace(/(badge\/leaves-)\d+(-)/, `$1${leafCount}$2`)
    .replace(/(badge\/catalog%20coverage-)\d+(%25-)/, `$1${coverage}$2`)
    .replace(/(Catalog coverage is )\d+%/, `$1${coverage}%`)
    .replace(/(all )\d+( authoritative leaves)/, `$1${leafCount}$2`)
    .replace(/(\| Tree \| Branches \| Leaves \|\n\| --- \| ---: \| ---: \|\n)(?:\|.*\n)+/, `$1${rows}\n`)
    .replace(/\*\*Total:\*\* \d+ trees · \d+ branches · \d+ leaves/,
      `**Total:** ${catalog.treeCount} trees · ${catalog.branchCount} branches · ${leafCount} leaves`)
    .replace(/(\*\*Level distribution:\*\* ).+/, `$1${levels}`);

  fs.writeFileSync('README.md', readme);
}

/** Rewrite every derived file from the catalog. */
export function regenerate(catalog) {
  const trees = group(catalog);
  writeBranchReadmes(trees);
  writeTreeReadmes(trees);
  writeCatalogMd(catalog, trees);
  writeReadme(catalog, trees);
}
