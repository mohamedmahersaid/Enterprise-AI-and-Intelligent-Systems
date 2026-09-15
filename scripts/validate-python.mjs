/**
 * Compiles every ```python block in the curriculum with a real Python parser.
 *
 * The leaves ship scripts readers are expected to copy and run. A block that
 * does not parse is broken for every one of them, and nothing in the toolchain
 * noticed: validate-content checks markdown structure, validate-mermaid parses
 * diagrams, and the Python between them was never looked at.
 *
 * Compiles only - nothing is executed. Parsing catches the whole class of
 * defect that matters here (a typo shipped into teaching material) without
 * running untrusted code as part of a build.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const { leaves } = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));

// Collect blocks with the markdown line they start on, so a failure points at
// the file a contributor edits rather than at an offset inside a fragment.
const blocks = [];
for (const leaf of leaves) {
  if (!fs.existsSync(leaf.path)) continue;
  const lines = fs.readFileSync(leaf.path, 'utf8').split('\n');
  let start = -1;
  for (const [index, line] of lines.entries()) {
    if (start === -1 && line.trimEnd() === '```python') {
      start = index;
    } else if (start !== -1 && line.trimEnd() === '```') {
      blocks.push({
        file: leaf.path,
        // The fence sits on `start`, so the first code line is start + 2 in
        // one-based terms; compile() reports one-based lines within the block.
        offset: start + 1,
        code: lines.slice(start + 1, index).join('\n'),
      });
      start = -1;
    }
  }
  if (start !== -1) {
    console.error(`${leaf.path}: unterminated \`\`\`python fence at line ${start + 1}`);
    process.exit(1);
  }
}

if (!blocks.length) {
  console.log('No python blocks found.');
  process.exit(0);
}

// One subprocess for the whole corpus; the payload goes over stdin so no
// temporary files are written and no path assumptions are made.
const driver = `
import json, sys
blocks = json.load(sys.stdin)
failures = []
for block in blocks:
    try:
        # Compiled under a synthetic name on purpose. Passing the real markdown
        # path makes CPython resolve SyntaxError.text through linecache, which
        # reads that file and quotes whatever prose happens to sit on the line -
        # a confidently wrong excerpt. The offending line is taken from the block.
        compile(block["code"], "<leaf-block>", "exec")
    except SyntaxError as error:
        lineno = error.lineno or 1
        source = block["code"].splitlines()
        text = source[lineno - 1] if 0 < lineno <= len(source) else ""
        failures.append({
            "file": block["file"],
            "line": block["offset"] + lineno,
            "msg": error.msg,
            "text": text.rstrip(),
        })
json.dump(failures, sys.stdout)
`;

const result = spawnSync('python3', ['-c', driver], {
  input: JSON.stringify(blocks),
  encoding: 'utf8',
});

if (result.error?.code === 'ENOENT') {
  // Failing loudly rather than skipping: a check that quietly does nothing when
  // a tool is missing is worse than no check, because it reports success.
  console.error(
    'python3 was not found, so the python blocks could not be checked.\n' +
    'Install Python 3 and re-run. This check compiles the scripts the leaves ' +
    'ship; skipping it would let a syntax error reach readers.'
  );
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr.trim() || 'python3 exited non-zero.');
  process.exit(1);
}

const failures = JSON.parse(result.stdout);
for (const failure of failures) {
  console.error(`${failure.file}:${failure.line} ${failure.msg}`);
  if (failure.text) console.error(`    ${failure.text}`);
}

if (failures.length) {
  console.error(`\n${failures.length} python block(s) failed to compile.`);
  process.exit(1);
}

console.log(
  `Compiled ${blocks.length} python blocks across ` +
  `${new Set(blocks.map((b) => b.file)).size} leaves.`
);
