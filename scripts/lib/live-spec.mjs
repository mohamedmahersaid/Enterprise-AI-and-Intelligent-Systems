/**
 * The "## Commands" section of a leaf, parsed heading-first, and the offline
 * checks that keep a data/live/<leaf-id>.json spec in step with its leaf.
 *
 * live-run.mjs executes the text a reader would copy, so the pairing of a
 * Command number with its text must be exact. The regex this replaces matched
 * `### Command N` lazily forward to the next ```text fence, so a Command whose
 * own fence was missing or mislabelled silently took the NEXT Command's text -
 * and could run a command the spec deliberately skips. Here each `### Command
 * N` heading owns everything up to the next heading, and the single ```text
 * fence inside that span is the command; anything else is an error, never a
 * guess.
 *
 * checkSpec is the spec-vs-leaf consistency check, shared by live-run.mjs and
 * validate-content, so a PR that edits a leaf out from under its spec fails
 * offline in seconds rather than at the next live run. Unknown keys in the
 * spec are tolerated: later phases add fields, and an older checker must not
 * fail a newer spec.
 */

/**
 * The leaf's commands by number, heading-first: {commands, errors} where
 * `commands` maps each Command number to the text of its one ```text fence.
 * Any shape this parser would have to guess about - a Command with no text
 * fence or with two, a heading under `## Commands` that is not `### Command
 * N`, a fence owned by no Command, a duplicate number - is an error instead.
 */
export function parseCommands(body, file = 'leaf') {
  const commands = new Map();
  const errors = [];
  const section = body.split(/\n## Commands[ \t]*\n/)[1]?.split('\n## ')[0];
  if (section === undefined) {
    errors.push(`${file}: has no "## Commands" section.`);
    return { commands, errors };
  }

  // First pass: fence spans, so headings inside a fence are content, and each
  // fence can be assigned to the Command heading that owns it.
  const lines = section.split('\n');
  const fences = [];
  let open = null;
  for (const [i, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (open) {
      if (line === '```') {
        fences.push(open);
        open = null;
      } else {
        open.lines.push(raw);
      }
    } else if (line.startsWith('```')) {
      open = { lang: line.slice(3).trim(), at: i, lines: [] };
    }
  }
  if (open) {
    errors.push(`${file}: unterminated \`\`\`${open.lang || ''} fence under ## Commands.`);
    return { commands, errors };
  }
  const inFence = (i) => fences.some((f) => i > f.at && i <= f.at + f.lines.length + 1);

  // Second pass: each `### Command N` owns every line to the next heading.
  const headings = [];
  for (const [i, raw] of lines.entries()) {
    if (inFence(i)) continue;
    const h = raw.match(/^(#{3,6}) (.*)$/);
    if (!h) continue;
    const m = h[1] === '###' && h[2].match(/^Command (\d+)$/);
    if (!m) {
      errors.push(
        `${file}: heading "${h[1]} ${h[2]}" under ## Commands - only \`### Command <number>\` ` +
          'headings belong there, so no fence can hide from the checks.'
      );
      continue;
    }
    headings.push({ n: Number(m[1]), at: i });
  }

  const seen = new Set();
  for (const [j, h] of headings.entries()) {
    if (seen.has(h.n)) errors.push(`${file}: two "### Command ${h.n}" headings.`);
    seen.add(h.n);
    const end = headings[j + 1]?.at ?? lines.length;
    const owned = fences.filter((f) => f.at > h.at && f.at < end);
    const texts = owned.filter((f) => f.lang === 'text');
    if (texts.length !== 1) {
      const found = owned.length ? `found ${owned.map((f) => `\`\`\`${f.lang || '(unlabelled)'}`).join(', ')}` : 'found none';
      errors.push(
        `${file}: Command ${h.n} must hold exactly one \`\`\`text fence (${found}). ` +
          'Without it, the command cannot be paired with its number.'
      );
      continue;
    }
    if (owned.length > texts.length) {
      errors.push(
        `${file}: Command ${h.n} has ${owned.length - 1} extra fence(s) beside its \`\`\`text one - ` +
          'a reader cannot tell which to run.'
      );
    }
    commands.set(h.n, texts[0].lines.join('\n').trimEnd());
  }

  for (const f of fences) {
    if (!headings.some((h, j) => f.at > h.at && f.at < (headings[j + 1]?.at ?? lines.length))) {
      errors.push(`${file}: a \`\`\`${f.lang || '(unlabelled)'} fence under ## Commands belongs to no Command heading.`);
    }
  }

  return { commands, errors };
}

/**
 * The `### <name>` headings under a leaf's `## Automation scripts` section,
 * which a spec's `scripts` field may name: the script live-run extracts comes
 * from the leaf itself, never from a copy that could drift from it.
 */
export function scriptHeadings(body) {
  const section = body.split(/\n## Automation scripts[ \t]*\n/)[1]?.split('\n## ')[0] ?? '';
  const names = new Set();
  let fence = null;
  for (const raw of section.split('\n')) {
    const line = raw.trimEnd();
    if (fence) {
      if (line === '```') fence = null;
    } else if (line.startsWith('```')) {
      fence = line;
    } else if (line.startsWith('### ')) {
      names.add(line.slice(4).trim());
    }
  }
  return names;
}

/** A working-directory path a spec may write: relative, and never escaping. */
const insideWork = (name) =>
  typeof name === 'string' && name.trim() !== '' && !name.startsWith('/') &&
  !name.includes('..') && !name.includes('\\');

const PLACEHOLDER = /^<[^<>\n]+>$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Whether a data/live spec still matches the leaf's commands: every step must
 * name a Command the leaf has, every leaf Command must be run or skipped with
 * a reason, and never both, so a command added to a leaf - or renumbered under
 * the spec - cannot silently go untested. Fixture names must be bare file
 * names, because live-run writes them with path.join(work, name). Keys this
 * function does not know are ignored, not errors.
 *
 * The spec may also say how to build and judge the run - each field checked
 * here so a bad spec fails offline, on every pull request:
 *
 *   copy        {dest: source} - repository paths copied into the working
 *               directory, confined to the leaf's own directory (pass
 *               opts.leafDir), so a spec cannot pull in unrelated files
 *   scripts     {dest: heading} - python blocks extracted from the leaf's
 *               "## Automation scripts" section by their `### ` heading
 *               (pass opts.scriptNames)
 *   setup       [{run, expect?, timeout?}] - commands run before the steps;
 *               reported separately and never counted as coverage
 *   env         non-secret environment values for setup and steps
 *   substitute  {"<placeholder>": value} - applied to step text; each key
 *               must be a `<...>` token that occurs in a planned command
 *   versions    commands whose one-line output records tool versions
 *
 * And per step:
 *
 *   expect      REQUIRED on every foreground step - a run must assert output,
 *               not just exit status. `"expect": null` opts out, and then
 *               `expect_reason` must say why.
 *   exit        the expected exit status (or a list); non-zero requires a
 *               real expect, or a failure could hide behind the status
 *   until       seconds - a streaming step: pass when expect matches the
 *               stream, fail when time runs out; requires a real expect
 *   capture     {name, regex} - group 1 of the match on the step's output
 *               becomes `<name>` for later steps' substitution
 */
export function checkSpec(spec, commands, specPath = 'spec', opts = {}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return [`${specPath}: must be a JSON object.`];
  }
  const errors = [];
  const captured = new Set();

  const planned = new Set();
  if (!Array.isArray(spec.steps) || !spec.steps.length) {
    errors.push(`${specPath}: has no steps.`);
  } else {
    for (const [i, step] of spec.steps.entries()) {
      if (!step || typeof step !== 'object' || Array.isArray(step) || !Number.isInteger(step.command)) {
        errors.push(`${specPath}: step #${i + 1} has no integer "command".`);
        continue;
      }
      planned.add(step.command);
      const at = `${specPath}: Command ${step.command}`;
      const hasExpect = typeof step.expect === 'string' && step.expect.trim() !== '';
      if (step.background) {
        if (typeof step.ready !== 'string' || !step.ready.trim()) {
          errors.push(`${at} is a background step with no "ready" probe.`);
        }
      } else if (!hasExpect) {
        if (step.expect !== null) {
          errors.push(`${at} has no "expect". Assert the output, or set "expect": null with an "expect_reason".`);
        } else if (typeof step.expect_reason !== 'string' || !step.expect_reason.trim()) {
          errors.push(`${at} opts out of "expect" without an "expect_reason".`);
        }
      }
      if (step.exit !== undefined) {
        const exits = Array.isArray(step.exit) ? step.exit : [step.exit];
        if (!exits.length || exits.some((e) => !Number.isInteger(e) || e < 0 || e > 255)) {
          errors.push(`${at} has an "exit" that is not an exit status (0-255) or a list of them.`);
        } else if (exits.some((e) => e !== 0) && !hasExpect) {
          errors.push(`${at} expects a non-zero exit but asserts no output - a real failure could hide behind the status.`);
        }
      }
      if (step.until !== undefined) {
        if (!(typeof step.until === 'number' && step.until > 0) || step.background) {
          errors.push(`${at} has an invalid "until": a positive number of seconds, on a foreground step.`);
        } else if (!hasExpect) {
          errors.push(`${at} streams with "until" but has no "expect" to wait for.`);
        }
      }
      if (step.capture !== undefined) {
        const c = step.capture;
        if (!c || typeof c !== 'object' || !ENV_NAME.test(String(c.name ?? ''))) {
          errors.push(`${at} has a "capture" without a valid variable name.`);
        } else {
          captured.add(c.name);
          try {
            if (new RegExp(c.regex).source.indexOf('(') === -1) {
              errors.push(`${at} capture regex has no group to capture.`);
            }
          } catch {
            errors.push(`${at} capture regex does not compile.`);
          }
        }
      }
    }
  }

  const skipped = new Set();
  const skip = spec.skip ?? {};
  if (typeof skip !== 'object' || Array.isArray(skip)) {
    errors.push(`${specPath}: "skip" must map each skipped Command number to its reason.`);
  } else {
    for (const [key, why] of Object.entries(skip)) {
      if (!/^\d+$/.test(key)) {
        errors.push(`${specPath}: skip key "${key}" is not a Command number.`);
        continue;
      }
      skipped.add(Number(key));
      if (typeof why !== 'string' || !why.trim()) {
        errors.push(`${specPath}: skip ${key} has no reason.`);
      }
    }
  }

  for (const n of [...new Set([...planned, ...skipped])].sort((a, b) => a - b)) {
    if (!commands.has(n)) errors.push(`${specPath}: names Command ${n}, which the leaf does not have.`);
    if (planned.has(n) && skipped.has(n)) errors.push(`${specPath}: Command ${n} is both run and skipped.`);
  }
  for (const n of commands.keys()) {
    if (!planned.has(n) && !skipped.has(n)) {
      errors.push(`${specPath}: Command ${n} is neither run nor skipped with a reason.`);
    }
  }

  const files = spec.files ?? {};
  if (typeof files === 'object' && !Array.isArray(files)) {
    for (const name of Object.keys(files)) {
      if (!name.trim() || /[/\\]/.test(name) || name.includes('..')) {
        errors.push(`${specPath}: files name "${name}" must be a bare file name inside the working directory.`);
      }
    }
  } else {
    errors.push(`${specPath}: "files" must map each fixture name to its content.`);
  }

  const copy = spec.copy ?? {};
  if (typeof copy === 'object' && !Array.isArray(copy)) {
    for (const [dest, source] of Object.entries(copy)) {
      if (!insideWork(dest)) {
        errors.push(`${specPath}: copy destination "${dest}" must stay inside the working directory.`);
      }
      const dir = opts.leafDir ? `${opts.leafDir.replace(/\/+$/, '')}/` : null;
      if (typeof source !== 'string' || source.includes('..') || (dir && !source.startsWith(dir))) {
        errors.push(
          `${specPath}: copy source "${source}" must be a path under the leaf's own directory` +
            `${dir ? ` (${dir})` : ''}, so a spec cannot pull in unrelated files.`
        );
      }
    }
  } else {
    errors.push(`${specPath}: "copy" must map each destination to a repository path.`);
  }

  const scripts = spec.scripts ?? {};
  if (typeof scripts === 'object' && !Array.isArray(scripts)) {
    for (const [dest, heading] of Object.entries(scripts)) {
      if (!insideWork(dest) || dest.includes('/')) {
        errors.push(`${specPath}: scripts destination "${dest}" must be a bare file name.`);
      }
      if (typeof heading !== 'string' || (opts.scriptNames && !opts.scriptNames.has(heading))) {
        errors.push(
          `${specPath}: scripts heading "${heading}" is not a \`### \` heading under the leaf's ## Automation scripts.`
        );
      }
    }
  } else {
    errors.push(`${specPath}: "scripts" must map each file name to an Automation scripts heading.`);
  }

  const setup = spec.setup ?? [];
  if (Array.isArray(setup)) {
    for (const [i, s] of setup.entries()) {
      if (!s || typeof s !== 'object' || typeof s.run !== 'string' || !s.run.trim()) {
        errors.push(`${specPath}: setup #${i + 1} has no "run" command.`);
      }
    }
  } else {
    errors.push(`${specPath}: "setup" must be a list of {run} commands.`);
  }

  const env = spec.env ?? {};
  if (typeof env === 'object' && !Array.isArray(env)) {
    for (const [name, value] of Object.entries(env)) {
      if (!ENV_NAME.test(name) || typeof value !== 'string') {
        errors.push(`${specPath}: env "${name}" must be a valid variable name with a string value.`);
      }
    }
  } else {
    errors.push(`${specPath}: "env" must map variable names to values.`);
  }

  const substitute = spec.substitute ?? {};
  if (typeof substitute === 'object' && !Array.isArray(substitute)) {
    const texts = [...planned].map((n) => commands.get(n) ?? '').join('\n');
    for (const [token, value] of Object.entries(substitute)) {
      if (!PLACEHOLDER.test(token)) {
        errors.push(`${specPath}: substitute key "${token}" is not a <placeholder> token.`);
      } else if (!texts.includes(token) && !captured.has(token.slice(1, -1))) {
        errors.push(`${specPath}: substitute key "${token}" occurs in no planned command.`);
      }
      if (typeof value !== 'string') {
        errors.push(`${specPath}: substitute value for "${token}" must be a string.`);
      }
    }
  } else {
    errors.push(`${specPath}: "substitute" must map each <placeholder> to its value.`);
  }

  const versions = spec.versions ?? [];
  if (!Array.isArray(versions) || versions.some((v) => typeof v !== 'string' || !v.trim())) {
    errors.push(`${specPath}: "versions" must be a list of commands.`);
  }

  return errors;
}

/**
 * The leaf paths and fixture directories live.yml's pull_request filter must
 * list: a leaf with a spec that is missing from the filter would join the
 * matrix on main yet never run on the pull request that edits it. The filter
 * is static YAML, so this reads its `paths:` items textually.
 */
export function checkLivePaths(liveYml, entries) {
  const errors = [];
  const paths = new Set(
    [...liveYml.matchAll(/^\s+- ([^\s#]+)\s*(?:#.*)?$/gm)].map((m) => m[1].replace(/^['"]|['"]$/g, ''))
  );
  for (const { leafPath, fixturesDir } of entries) {
    if (!paths.has(leafPath)) {
      errors.push(`live.yml: pull_request paths do not list ${leafPath}, so its live spec never runs on the PR that edits it.`);
    }
    if (fixturesDir && ![...paths].some((p) => p === fixturesDir || p === `${fixturesDir}/**`)) {
      errors.push(`live.yml: pull_request paths do not list ${fixturesDir}/**, so a fixture edit never re-runs the leaf.`);
    }
  }
  return errors;
}
