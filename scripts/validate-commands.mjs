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
 * validate-mermaid and validate-python. The same rules cover the leaves'
 * ```bash and ```powershell fences, so a fence label cannot switch them off;
 * those fences are real scripts, not placeholder commands, so they also get a
 * parse-only check (`bash -n` parses without running anything).
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
import { spawnSync } from 'node:child_process';
import { RULES, SECRET_PATTERNS, checkBlocks, checkPowerShell, commandBlocks, loadDenyRules, scriptBlocks, secretFindings } from './lib/commands.mjs';

const { leaves } = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));

const deny = loadDenyRules();
if (deny.errors.length) {
  console.error(deny.errors.join('\n'));
  console.error(`\n${deny.errors.length} deny-list error(s).`);
  process.exit(1);
}

const blocks = [];
const scripts = [];
const secrets = [];
for (const leaf of leaves) {
  if (!fs.existsSync(leaf.path)) continue;
  const text = fs.readFileSync(leaf.path, 'utf8');
  // Known credential shapes, over the whole file: prose, frontmatter and
  // every fence, where the block rules below see only ```text fences.
  secrets.push(...secretFindings(leaf.path, text));
  try {
    blocks.push(...commandBlocks(leaf.path, text));
    scripts.push(...scriptBlocks(leaf.path, text));
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

// The safety rules and the deny list apply to the bash and powershell fences
// too - a fence label must not be a way to step around them. On top of that,
// each script fence gets a parse-only check: `bash -n` for bash (parses, runs
// nothing; skipped with a note where bash is not installed, as on Windows) and
// a string/comment-aware brace-and-quote balance check for powershell, because
// pwsh is not a dependency of this repository. See scripts/lib/commands.mjs.
const failures = [...secrets, ...checkBlocks([...blocks, ...scripts], [...RULES, ...deny.rules])];

let bashMissing = false;
for (const block of scripts) {
  if (block.lang === 'bash') {
    const r = spawnSync('bash', ['-n'], { input: block.lines.join('\n'), encoding: 'utf8' });
    if (r.error?.code === 'ENOENT') {
      bashMissing = true;
    } else if (r.status !== 0) {
      failures.push({
        file: block.file,
        line: block.offset,
        id: 'bash-parse',
        why: 'does not parse under `bash -n`. A script a reader cannot even start is broken content.',
        text: (r.stderr || '').split('\n').filter(Boolean).slice(0, 3).join(' | '),
      });
    }
  } else if (block.lang === 'powershell') {
    const why = checkPowerShell(block.lines);
    if (why) {
      failures.push({
        file: block.file,
        line: block.offset,
        id: 'powershell-parse',
        why: 'has unbalanced braces or an unterminated string - a truncated or mispasted script.',
        text: why,
      });
    }
  }
}
if (bashMissing) console.error('note: bash is not installed here, so bash fences were not parse-checked.');

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
  (deny.rules.length ? ` and ${deny.rules.length} deny-list entries` : '') +
  `, and every leaf line against ${SECRET_PATTERNS.length} credential formats.`
);
if (scripts.length) {
  console.log(
    `Checked ${scripts.length} script fence(s) (` +
    `${scripts.map((b) => b.lang).sort().join(', ')}) against the same rules, plus a parse check.`
  );
}
