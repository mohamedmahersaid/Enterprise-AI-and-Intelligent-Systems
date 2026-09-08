/**
 * Rewrites every file derived from data/catalog.json. Run it after editing the
 * catalog by hand; validate-content.mjs asserts the same relationships in CI,
 * so this is the fix for a failure it reports rather than a separate format.
 */
import { readCatalog, writeCatalog, recount, regenerate } from './lib/derive.mjs';

const catalog = recount(readCatalog());
writeCatalog(catalog);
regenerate(catalog);

console.log(
  `Regenerated navigation for ${catalog.leaves.length} leaves across ` +
  `${catalog.treeCount} trees and ${catalog.branchCount} branches.`
);
