/**
 * Rewrites every file derived from data/catalog.json. Run it after editing the
 * catalog by hand; validate-content.mjs asserts the same relationships in CI,
 * so this is the fix for a failure it reports rather than a separate format.
 *
 * With --check nothing is written: every derived file is rendered in memory
 * and compared against the file on disk, and any difference - a hand edit to a
 * generated file, or a catalog edit that was never regenerated - fails. This
 * is `npm run validate:regen`, run by CI and run.bat.
 */
import { readCatalog, writeCatalog, recount, regenerate, regenDrift, renderDerived } from './lib/derive.mjs';

const catalog = recount(readCatalog());

if (process.argv.includes('--check')) {
  const drifted = regenDrift(catalog);
  if (drifted.length) {
    console.error(
      'Derived file(s) disagree with what regeneration writes - a generated ' +
      "file was edited by hand, or the catalog changed without 'npm run regen':"
    );
    for (const file of drifted) console.error(`  ${file}`);
    process.exit(1);
  }
  console.log(
    `Derived files in step with data/catalog.json: ${renderDerived(catalog).length} files ` +
    'plus the catalog counts, byte-compared against regeneration.'
  );
} else {
  writeCatalog(catalog);
  regenerate(catalog);
  console.log(
    `Regenerated navigation for ${catalog.leaves.length} leaves across ` +
    `${catalog.treeCount} trees and ${catalog.branchCount} branches.`
  );
}
