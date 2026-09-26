/**
 * Checks every ```text command block in the curriculum against a small set of
 * safety and convention invariants.
 *
 * The leaves ship 216 command blocks - more executable content than the python
 * and mermaid put together - and until now nothing looked at them. This closes
 * that hole, but deliberately closes only the part that can be closed honestly.
 *
 * What this is NOT: a shell linter. The obvious design, parse-only `bash -n`,
 * was built and rejected on evidence. It fails seven blocks, and all seven are
 * correct content: two are SQL, one is a pseudo-formula, and four use the
 * repository's `<placeholder>` convention, which bash reads as redirection. A
 * gate that fires on correct content is worse than no gate, so it is not here.
 *
 * What this IS: a set of invariants that hold across all 216 blocks today and
 * that a reader would be harmed by if they stopped holding. They are all
 * textual, so nothing is executed - the same parse-don't-run posture as
 * validate-mermaid and validate-python.
 *
 * Every rule below was measured against the corpus before being added. A rule
 * that fires on existing correct content is a bug in the rule, not a finding.
 *
 * On top of those, data/command-deny.json, when present, lists commands known
 * to be stale - a command group that does not exist, a flag that was removed -
 * each with the reason, its replacement and the URL checked. They are banned
 * inside command blocks only, so prose can still say what replaced what. The
 * rules and the extraction live in scripts/lib/commands.mjs, where the tests in
 * test/ exercise them.
 */
import fs from 'node:fs';
import { RULES, checkBlocks, commandBlocks, loadDenyRules } from './lib/commands.mjs';

const { leaves } = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));

const deny = loadDenyRules();
if (deny.errors.length) {
  console.error(deny.errors.join('\n'));
  console.error(`\n${deny.errors.length} deny-list error(s).`);
  process.exit(1);
}

const blocks = [];
for (const leaf of leaves) {
  if (!fs.existsSync(leaf.path)) continue;
  try {
    blocks.push(...commandBlocks(leaf.path, fs.readFileSync(leaf.path, 'utf8')));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (!blocks.length) {
  // Not a silent pass: the corpus is known to ship command blocks, so finding
  // none means the extractor broke, not that the repository is clean.
  console.error(
    'No ```text command blocks found. The leaves are expected to ship them, ' +
    'so this most likely means the fence format changed and this check is ' +
    'no longer looking at anything.'
  );
  process.exit(1);
}

const failures = checkBlocks(blocks, [...RULES, ...deny.rules]);

for (const failure of failures) {
  console.error(`${failure.file}:${failure.line} [${failure.id}] ${failure.why}`);
  console.error(`    ${failure.text}`);
}

if (failures.length) {
  console.error(`\n${failures.length} command block issue(s) found.`);
  process.exit(1);
}

console.log(
  `Checked ${blocks.length} command blocks across ` +
  `${new Set(blocks.map((b) => b.file)).size} leaves ` +
  `against ${RULES.length} safety and convention rules` +
  (deny.rules.length ? ` and ${deny.rules.length} deny-list entries.` : '.')
);
