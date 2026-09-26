// Runner parity: every gate in package.json must be run by the CI workflow and
// by run.bat. A gate counts as run only where it is invoked - a `run:` value in
// the workflow, a non-comment line in run.bat - so a comment, a step name or an
// echoed help line that mentions it does not count.

// Every `validate:*` script, plus `test` when there is one.
export function parityGates(scripts) {
  const gates = Object.keys(scripts).filter((n) => n.startsWith('validate:'));
  if (scripts.test) gates.push('test');
  return gates;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `npm run <gate>`, and for `test` also `npm test`, as a whole word.
function npmInvocation(gate) {
  const run = gate === 'test' ? '(?:run )?' : 'run ';
  return new RegExp(`\\bnpm ${run}${escape(gate)}(?=\\s|$)`);
}

// The command lines of a GitHub Actions workflow: each single-line `run:`
// value, with a trailing YAML comment removed, and each line of a `run: |` or
// `run: >` block, less its shell comments.
export function workflowCommands(text) {
  const lines = text.split(/\r?\n/);
  const commands = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const value = m[2];
    if (/^[|>][+-]?\d*\s*(?:#.*)?$/.test(value)) {
      const indent = m[1].length;
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.trim() && next.length - next.trimStart().length <= indent) break;
        i++;
        if (next.trim() && !next.trim().startsWith('#')) commands.push(next.trim());
      }
    } else {
      commands.push(value.replace(/\s+#.*$/, ''));
    }
  }
  return commands;
}

// The lines of a batch file that execute something: not `rem` or `::`
// comments, and not `echo` lines, which only print.
export function batchCommands(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^@/, ''))
    .filter((l) => l && !/^(?:rem\b|::|echo\b)/i.test(l));
}

// Whether a runner's text runs a gate. `kind` is 'workflow' or 'batch'; in
// run.bat a gate also runs through `:run_step "<label>" <gate>`.
export function runsGate(text, gate, kind) {
  const npm = npmInvocation(gate);
  if (kind === 'workflow') return workflowCommands(text).some((c) => npm.test(c));
  if (kind === 'batch') {
    const step = new RegExp(`:run_step\\s+"[^"]*"\\s+${escape(gate)}(?=\\s|$)`);
    return batchCommands(text).some((c) => npm.test(c) || step.test(c));
  }
  throw new Error(`unknown runner kind: ${kind}`);
}
