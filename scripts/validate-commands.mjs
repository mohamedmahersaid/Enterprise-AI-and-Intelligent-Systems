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
 */
import fs from 'node:fs';

const { leaves } = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));

/**
 * Each rule states what it protects, because a future contributor hitting one
 * needs to know whether to fix the command or fix the rule.
 *
 * Deliberately absent: a `--force` rule. Force flags are legitimate in
 * documented git and kubectl workflows, so it would eventually fire on correct
 * content - exactly the failure mode this file exists to avoid.
 */
const RULES = [
  {
    id: 'literal-credential',
    // Requires a credential-shaped word, then a value of 12+ literal characters.
    // `$VAR`, `${VAR}` and `<placeholder>` do not match: none of `$`, `{` or `<`
    // is in the value class, so env-var and placeholder forms stay legal.
    pattern: /(?:password|secret|api[-_]?key|token|bearer)\s*[=:]\s*["']?[A-Za-z0-9._-]{12,}/i,
    why: 'looks like a real credential. Use an environment variable or a <placeholder>.',
  },
  {
    id: 'destructive-rm',
    pattern: /\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*f?\s+\//,
    why: 'recursively removes an absolute path. A reader pasting this can lose data.',
  },
  {
    id: 'disk-destructive',
    pattern: /\b(?:mkfs\b|dd\s+if=)/,
    why: 'writes to a device. Not something to ship without an explicit warning.',
  },
  {
    id: 'sql-drop',
    pattern: /\bdrop\s+(?:database|table)\b/i,
    why: 'drops a database object. Teaching material should not hand this to a copy-paste.',
  },
  {
    id: 'curl-pipe-shell',
    pattern: /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/,
    why: 'pipes a download straight into a shell, which executes whatever the host returns.',
  },
  {
    id: 'plaintext-http',
    // Loopback is exempt: local inference endpoints are legitimately plain http.
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
    why: 'sends traffic unencrypted to a non-loopback host. Use https.',
  },
  {
    id: 'placeholder-drift',
    // The corpus uses <angle-bracket> placeholders throughout. These other
    // spellings are the ones that leak in and read as unfinished work.
    pattern: /\b(?:YOUR[_-][A-Z_]+|CHANGEME|REPLACE[_-]ME|TODO|FIXME|x{5,})\b/i,
    why: 'is not the repository\'s placeholder convention. Use <angle-brackets>.',
  },
];

// Collect blocks with the markdown line they start on, so a failure points at
// the line a contributor edits rather than an offset inside a fragment.
const blocks = [];
for (const leaf of leaves) {
  if (!fs.existsSync(leaf.path)) continue;
  const lines = fs.readFileSync(leaf.path, 'utf8').split('\n');
  let start = -1;
  for (const [index, line] of lines.entries()) {
    if (start === -1 && line.trimEnd() === '```text') {
      start = index;
    } else if (start !== -1 && line.trimEnd() === '```') {
      blocks.push({
        file: leaf.path,
        offset: start + 1,
        lines: lines.slice(start + 1, index),
      });
      start = -1;
    }
  }
  if (start !== -1) {
    console.error(`${leaf.path}: unterminated \`\`\`text fence at line ${start + 1}`);
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

const failures = [];
for (const block of blocks) {
  for (const [index, line] of block.lines.entries()) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        failures.push({
          file: block.file,
          line: block.offset + index + 1,
          id: rule.id,
          why: rule.why,
          text: line.trim(),
        });
      }
    }
  }
}

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
  `against ${RULES.length} safety and convention rules.`
);
