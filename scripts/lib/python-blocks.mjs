/**
 * Reads the ```python blocks out of the leaves, and the dependencies each leaf
 * declares for them.
 *
 * Shared by validate-python, which compiles the blocks and checks their
 * imports are declared, and validate-scripts, which runs them. Both need the
 * same blocks with the same line numbers, so the extraction lives here once.
 */
import fs from 'node:fs';

/**
 * The interpreter leaf code is compiled and run with. LEAF_PYTHON wins;
 * otherwise the name Python's own installer puts on PATH - `python3` on Linux
 * and macOS, `python` on Windows, where `python3` is at best a Store shim.
 */
export const PYTHON =
  process.env.LEAF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

/**
 * Every python block in catalog order, with the markdown line it starts on so
 * a failure points at the file a contributor edits rather than at an offset
 * inside a fragment. Throws on an unterminated fence: a block that swallows the
 * rest of the leaf would otherwise be reported as a confusing syntax error.
 */
export function pythonBlocks(leaves) {
  const blocks = [];
  for (const leaf of leaves) {
    if (!fs.existsSync(leaf.path)) continue;
    const lines = fs.readFileSync(leaf.path, 'utf8').split('\n');
    let start = -1;
    for (const [index, line] of lines.entries()) {
      if (start === -1 && line.trimEnd() === '```python') {
        start = index;
      } else if (start !== -1 && line.trimEnd() === '```') {
        // The heading nearest above the fence names the script for readers.
        let name = '';
        for (let i = start - 1; i >= 0; i--) {
          if (lines[i].startsWith('### ')) {
            name = lines[i].slice(4).trim();
            break;
          }
        }
        blocks.push({
          file: leaf.path,
          name,
          // The fence sits on `start`, so the first code line is start + 2 in
          // one-based terms; Python reports one-based lines within the block.
          offset: start + 1,
          code: lines.slice(start + 1, index).join('\n'),
        });
        start = -1;
      }
    }
    if (start !== -1) {
      throw new Error(`${leaf.path}: unterminated \`\`\`python fence at line ${start + 1}`);
    }
  }
  return blocks;
}

/** PEP 503 normalisation, so `langchain_core` and `langchain-core` agree. */
export function normalise(name) {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Import names that differ from the distribution a reader installs. Without
 * this, `import yaml` declared as `pip install pyyaml` would read as missing.
 */
const DISTRIBUTION = {
  bs4: 'beautifulsoup4',
  cv2: 'opencv-python',
  dotenv: 'python-dotenv',
  jwt: 'pyjwt',
  PIL: 'pillow',
  sklearn: 'scikit-learn',
  yaml: 'pyyaml',
};

export function distributionFor(module) {
  return normalise(DISTRIBUTION[module] ?? module);
}

/**
 * Whether a leaf declares what `import module` needs. Namespace packages ship
 * as several distributions under one import name - `import azure` comes from
 * `azure-identity`, `azure-search-documents` and others - so any declared
 * distribution under the namespace counts.
 */
export function isDeclared(module, declared) {
  if (declared.has(distributionFor(module))) return true;
  const namespace = `${normalise(module)}-`;
  return [...declared].some((name) => name.startsWith(namespace));
}

const PIP_INSTALL =
  /^(?:\S*\/)?(?:python3?(?:\.\d+)?\s+-m\s+)?(?:\S*\/)?pip3?\s+install\s+(.+)$/;

/** Options whose next token is a value, not a package. */
const TAKES_VALUE = new Set([
  '-r', '--requirement', '-c', '--constraint', '-e', '--editable',
  '-i', '--index-url', '--extra-index-url', '-f', '--find-links', '-t', '--target',
]);

function packagesIn(command) {
  const found = [];
  for (const part of command.split(/&&|;|\|\|/)) {
    const match = part.trim().match(PIP_INSTALL);
    if (!match) continue;
    const tokens = match[1].trim().split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].replace(/^["']|["']$/g, '');
      if (TAKES_VALUE.has(token)) {
        i++;
      } else if (!token.startsWith('-')) {
        // Drop extras and version specifiers: `pkg[extra]>=1.2` installs `pkg`.
        const name = token.split(/[[<>=!~;@\s]/)[0];
        if (name) found.push(normalise(name));
      }
    }
  }
  return found;
}

/**
 * The distributions a leaf tells its reader to install: every `pip install`
 * in a command block, or in inline code in the prose. A declaration anywhere
 * in the leaf counts, because that is where a reader following the leaf would
 * find it.
 */
export function declaredPackages(markdown) {
  const declared = new Set();
  let fence = null;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (fence === null && trimmed.startsWith('```')) {
      fence = trimmed.slice(3).trim();
      continue;
    }
    if (fence !== null && trimmed.startsWith('```')) {
      fence = null;
      continue;
    }
    if (fence === 'text' || fence === 'bash' || fence === 'shell') {
      packagesIn(trimmed).forEach((p) => declared.add(p));
    } else if (fence === null) {
      for (const [, code] of line.matchAll(/`([^`]+)`/g)) {
        packagesIn(code).forEach((p) => declared.add(p));
      }
    }
  }
  return declared;
}
