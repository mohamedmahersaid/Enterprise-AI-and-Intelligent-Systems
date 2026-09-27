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
 * The fence labels checked as scripts beside ```text: bash and PowerShell,
 * under the labels markdown authors spell them with. The safety rules protect
 * a reader who copies and runs a fence, and a `bash` or `powershell` fence is
 * run even more literally than a command block - so a rule the fence label
 * could switch off would be no rule at all. All of RULES applies to these
 * fences: each was re-read for fence-specificity and none is text-only - a
 * literal credential, a destructive command, a piped install, plaintext http
 * and placeholder drift harm a script's reader exactly as much (and none
 * fires on the corpus's script fences today). The deny list applies too: a
 * stale command is stale in any fence a reader would run.
 */
const SCRIPT_LANGS = { bash: 'bash', sh: 'bash', powershell: 'powershell', ps1: 'powershell', pwsh: 'powershell' };

/**
 * Every ```bash and ```powershell block in one leaf, shaped like
 * commandBlocks plus `lang` (normalised to 'bash' or 'powershell'). Unlike
 * commandBlocks this tracks every fence, so a script-looking line inside a
 * ```text or ```python block is content, not a new block. Throws on an
 * unterminated fence.
 */
export function scriptBlocks(file, text) {
  const lines = text.split('\n');
  const blocks = [];
  let open = null; // { line, label, lang } - lang only for the fences kept
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (open) {
      if (line === '```') {
        if (open.lang) blocks.push({ file, offset: open.line + 1, lang: open.lang, lines: lines.slice(open.line + 1, index) });
        open = null;
      }
    } else if (line.startsWith('```')) {
      const label = line.slice(3).trim().toLowerCase();
      open = { line: index, label, lang: SCRIPT_LANGS[label] };
    }
  }
  if (open?.lang) {
    throw new Error(`${file}: unterminated \`\`\`${open.label} fence at line ${open.line + 1}`);
  }
  return blocks;
}

/**
 * A minimal parse check for a powershell fence: strings, comments and
 * here-strings are consumed, then every brace, parenthesis and bracket must
 * pair and every string must terminate. Deliberately not an AST - pwsh is not
 * a dependency of this repository, and is not on the runners this must pass
 * on - but enough to catch the truncated or mispasted script it exists for.
 * Returns what is wrong, or null.
 */
export function checkPowerShell(lines) {
  const text = lines.join('\n');
  const stack = [];
  const pairs = { '}': '{', ')': '(', ']': '[' };
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (two === '<#') {
      const end = text.indexOf('#>', i + 2);
      if (end === -1) return `unterminated <# comment (line ${lineAt(i)})`;
      i = end + 2;
    } else if (c === '#') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
    } else if (two === '@"' || two === "@'") {
      // A here-string closes only at a line that starts with the quote and @.
      const close = `\n${two[1]}@`;
      const end = text.indexOf(close, i + 2);
      if (end === -1) return `unterminated ${two}...${two[1]}@ here-string (line ${lineAt(i)})`;
      i = end + close.length;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length) {
        if (c === '"' && text[j] === '`') { j += 2; continue; } // backtick escape
        if (text[j] === c) {
          if (text[j + 1] === c) { j += 2; continue; } // doubled-quote escape
          break;
        }
        j += 1;
      }
      if (j >= text.length) return `unterminated ${c === '"' ? 'double' : 'single'}-quoted string (line ${lineAt(i)})`;
      i = j + 1;
    } else if (c === '`') {
      i += 2; // escape outside a string, including a line continuation
    } else if ('{(['.includes(c)) {
      stack.push({ c, line: lineAt(i) });
      i += 1;
    } else if (c in pairs) {
      const open = stack.pop();
      if (!open || open.c !== pairs[c]) return `'${c}' on line ${lineAt(i)} closes nothing`;
      i += 1;
    } else {
      i += 1;
    }
  }
  if (stack.length) {
    const open = stack[stack.length - 1];
    return `'${open.c}' opened on line ${open.line} is never closed`;
  }
  return null;
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
