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
 * Whether a data/live spec still matches the leaf's commands: every step must
 * name a Command the leaf has, every leaf Command must be run or skipped with
 * a reason, and never both, so a command added to a leaf - or renumbered under
 * the spec - cannot silently go untested. Fixture names must be bare file
 * names, because live-run writes them with path.join(work, name). Keys this
 * function does not know are ignored, not errors.
 */
export function checkSpec(spec, commands, specPath = 'spec') {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return [`${specPath}: must be a JSON object.`];
  }
  const errors = [];

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

  return errors;
}
