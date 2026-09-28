/**
 * The live matrix: one leg per data/live spec, with the needs live.yml uses
 * to decide its install steps. Written for `fromJSON` in the workflow, so a
 * new spec joins the weekly run by existing - no YAML edit besides the
 * pull_request paths filter, which validate-content checks separately.
 *
 * Usage: node scripts/live-matrix.mjs            prints {"include": [...]}
 *        node scripts/live-matrix.mjs --github   appends matrix=<json> to
 *                                                $GITHUB_OUTPUT
 */
import fs from 'node:fs';

export function liveMatrix(catalog, specDir = 'data/live') {
  const include = [];
  if (!fs.existsSync(specDir)) return { include };
  for (const name of fs.readdirSync(specDir).filter((f) => f.endsWith('.json')).sort()) {
    const id = name.slice(0, -'.json'.length);
    const leaf = catalog.leaves.find((l) => l.id === id);
    if (!leaf) continue; // validate-content fails the PR that caused this
    include.push({ leaf: id, needs: leaf.needs.join(' ') });
  }
  return { include };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
  const matrix = JSON.stringify(liveMatrix(catalog));
  if (process.argv.includes('--github') && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\n`);
  }
  console.log(matrix);
}
