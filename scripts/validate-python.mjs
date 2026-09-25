/**
 * Compiles every ```python block in the curriculum with a real Python parser,
 * and checks that every third-party module a block imports is one the leaf
 * tells its reader to install.
 *
 * The leaves ship scripts readers are expected to copy and run. A block that
 * does not parse is broken for every one of them, and nothing in the toolchain
 * noticed: validate-content checks markdown structure, validate-mermaid parses
 * diagrams, and the Python between them was never looked at.
 *
 * A block that parses can still fail on its first line for a reader who was
 * never told to install `requests`. Eight such imports shipped undeclared, so
 * the declaration is now checked: a third-party import must be named by a
 * `pip install` somewhere in the same leaf. An import guarded by
 * `except ImportError` is optional by construction and is not required.
 *
 * Nothing is executed here; validate-scripts runs the blocks.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PYTHON, declaredPackages, distributionFor, pythonBlocks } from './lib/python-blocks.mjs';

const { leaves } = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));

let blocks;
try {
  blocks = pythonBlocks(leaves);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (!blocks.length) {
  console.log('No python blocks found.');
  process.exit(0);
}

// One subprocess for the whole corpus; the payload goes over stdin so no
// temporary files are written and no path assumptions are made.
const driver = `
import ast, json, sys

if sys.version_info < (3, 10):
    sys.exit("Python 3.10 or newer is required: the stdlib module list it provides "
             "is what separates a third-party import from a standard one.")

IMPORT_ERRORS = {"ImportError", "ModuleNotFoundError"}


def catches_import_error(handler):
    kinds = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return any(isinstance(k, ast.Name) and k.id in IMPORT_ERRORS for k in kinds)


class Imports(ast.NodeVisitor):
    \"\"\"Top-level module names, split by whether a failed import is handled.\"\"\"

    def __init__(self):
        self.required, self.optional, self.guarded = set(), set(), False

    def add(self, name):
        (self.optional if self.guarded else self.required).add(name.split(".")[0])

    def visit_Import(self, node):
        for alias in node.names:
            self.add(alias.name)

    def visit_ImportFrom(self, node):
        if node.module and not node.level:
            self.add(node.module)

    def visit_Try(self, node):
        outer = self.guarded
        self.guarded = outer or any(catches_import_error(h) for h in node.handlers)
        for child in node.body:
            self.visit(child)
        self.guarded = outer
        for child in node.handlers + node.orelse + node.finalbody:
            self.visit(child)

    visit_TryStar = visit_Try


blocks = json.load(sys.stdin)
failures = []
imports = []
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
        imports.append(None)
        continue
    found = Imports()
    found.visit(ast.parse(block["code"]))
    stdlib = sys.stdlib_module_names
    imports.append(sorted(m for m in found.required if m not in stdlib))
json.dump({"failures": failures, "imports": imports}, sys.stdout)
`;

const result = spawnSync(PYTHON, ['-c', driver], {
  input: JSON.stringify(blocks),
  encoding: 'utf8',
});

if (result.error?.code === 'ENOENT') {
  // Failing loudly rather than skipping: a check that quietly does nothing when
  // a tool is missing is worse than no check, because it reports success.
  console.error(
    `${PYTHON} was not found, so the python blocks could not be checked.\n` +
    'Install Python 3, or set LEAF_PYTHON to an interpreter, and re-run. ' +
    'This check compiles the scripts the leaves ' +
    'ship; skipping it would let a syntax error reach readers.'
  );
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr.trim() || `${PYTHON} exited non-zero.`);
  process.exit(1);
}

const { failures, imports } = JSON.parse(result.stdout);
for (const failure of failures) {
  console.error(`${failure.file}:${failure.line} ${failure.msg}`);
  if (failure.text) console.error(`    ${failure.text}`);
}

if (failures.length) {
  console.error(`\n${failures.length} python block(s) failed to compile.`);
  process.exit(1);
}

// A declaration anywhere in the leaf counts, so each leaf is read once.
const declared = new Map();
const undeclared = [];
let thirdParty = 0;
for (const [index, block] of blocks.entries()) {
  if (!declared.has(block.file)) {
    declared.set(block.file, declaredPackages(fs.readFileSync(block.file, 'utf8')));
  }
  for (const module of imports[index]) {
    thirdParty++;
    if (!declared.get(block.file).has(distributionFor(module))) {
      undeclared.push({ block, module });
    }
  }
}

for (const { block, module } of undeclared) {
  console.error(
    `${block.file}:${block.offset} ${block.name || 'python block'} imports ` +
    `\`${module}\`, but the leaf never tells the reader to install it.\n` +
    `    Add \`pip install ${distributionFor(module)}\` near the script, or guard the ` +
    `import with \`except ImportError\` if the script works without it.`
  );
}

if (undeclared.length) {
  console.error(`\n${undeclared.length} undeclared third-party import(s).`);
  process.exit(1);
}

console.log(
  `Compiled ${blocks.length} python blocks across ` +
  `${new Set(blocks.map((b) => b.file)).size} leaves; ` +
  `${thirdParty} third-party import(s), all declared.`
);
