/**
 * The command-block extraction and rules behind validate-commands, as pure
 * functions so they can be tested against fixtures rather than only against
 * the live corpus. See scripts/validate-commands.mjs for why the rules are
 * textual and why each one exists.
 */
import fs from 'node:fs';

/**
 * Each rule states what it protects, because a future contributor hitting one
 * needs to know whether to fix the command or fix the rule.
 *
 * Deliberately absent: a `--force` rule. Force flags are legitimate in
 * documented git and kubectl workflows, so it would eventually fire on correct
 * content - exactly the failure mode this file exists to avoid.
 */
export const RULES = [
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

/**
 * Every ```text block in one leaf, with the markdown line it starts on, so a
 * failure points at the line a contributor edits rather than an offset inside
 * a fragment. Throws on an unterminated fence.
 */
export function commandBlocks(file, text) {
  const lines = text.split('\n');
  const blocks = [];
  let start = -1;
  for (const [index, line] of lines.entries()) {
    if (start === -1 && line.trimEnd() === '```text') {
      start = index;
    } else if (start !== -1 && line.trimEnd() === '```') {
      blocks.push({ file, offset: start + 1, lines: lines.slice(start + 1, index) });
      start = -1;
    }
  }
  if (start !== -1) {
    throw new Error(`${file}: unterminated \`\`\`text fence at line ${start + 1}`);
  }
  return blocks;
}

/**
 * Commands known to be stale - a command group that does not exist, a flag
 * that was removed - banned inside command blocks only. Prose may still name
 * them, to say what replaced what; a reader pasting a fence cannot tell.
 */
export const DENY_PATH = 'data/command-deny.json';

const DENY_KEYS = ['pattern', 'reason', 'source'];

/**
 * Turns the deny-list entries into rules, or says why it cannot. Each entry is
 * {pattern, reason, source}: a JavaScript regular expression source, why the
 * command is wrong and what replaces it, and the URL that was checked.
 */
export function denyRules(entries, file = DENY_PATH) {
  const rules = [];
  const errors = [];
  if (!Array.isArray(entries)) {
    return { rules, errors: [`${file}: must be a JSON array of {pattern, reason, source}.`] };
  }
  for (const [i, entry] of entries.entries()) {
    const at = `${file}: entry #${i + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${at} is not an object of {pattern, reason, source}.`);
      continue;
    }
    const extra = Object.keys(entry).filter((k) => !DENY_KEYS.includes(k));
    if (extra.length) errors.push(`${at} has unknown key(s) ${extra.join(', ')}; only ${DENY_KEYS.join(', ')} are read.`);
    for (const key of DENY_KEYS) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) errors.push(`${at} has no "${key}".`);
    }
    if (typeof entry.source === 'string' && entry.source.trim() && !/^https?:\/\/\S+$/.test(entry.source)) {
      errors.push(`${at} source "${entry.source}" is not the URL that was checked.`);
    }
    if (typeof entry.pattern !== 'string' || !entry.pattern.trim()) continue;
    let pattern;
    try {
      pattern = new RegExp(entry.pattern);
    } catch (error) {
      errors.push(`${at} pattern does not compile: ${error.message}`);
      continue;
    }
    // A pattern that matches the empty string matches every line, which would
    // fail the whole corpus for a reason that names one command.
    if (pattern.test('')) {
      errors.push(`${at} pattern /${entry.pattern}/ matches an empty line, so it would match every line.`);
      continue;
    }
    rules.push({ id: 'deny-list', pattern, why: `${entry.reason} (checked: ${entry.source})` });
  }
  return { rules: errors.length ? [] : rules, errors };
}

/** The deny list as rules. An absent file means no rules, not an error. */
export function loadDenyRules(file = DENY_PATH) {
  if (!fs.existsSync(file)) return { rules: [], errors: [] };
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { rules: [], errors: [`${file}: is not valid JSON: ${error.message}`] };
  }
  return denyRules(entries, file);
}

/** Every line of every block that a rule matches. */
export function checkBlocks(blocks, rules = RULES) {
  const failures = [];
  for (const block of blocks) {
    for (const [index, line] of block.lines.entries()) {
      for (const rule of rules) {
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
  return failures;
}
