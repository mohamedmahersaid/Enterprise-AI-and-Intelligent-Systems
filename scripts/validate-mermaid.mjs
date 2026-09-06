/**
 * Parses every mermaid block in the curriculum with the real mermaid parser.
 * A diagram that fails to parse renders as an error box on GitHub, which is
 * invisible to any check that only asserts a ```mermaid fence exists.
 *
 * mermaid needs a DOM, so jsdom supplies one; nothing is rendered, only parsed.
 */
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false });

const { leaves } = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const errors = [];
let count = 0;

for (const leaf of leaves) {
  const lines = fs.readFileSync(leaf.path, 'utf8').split('\n');
  let start = null;
  for (const [i, line] of lines.entries()) {
    if (start === null && line.trim() === '```mermaid') {
      start = i;
    } else if (start !== null && line.trim() === '```') {
      const source = lines.slice(start + 1, i).join('\n');
      count += 1;
      try {
        await mermaid.parse(source);
      } catch (error) {
        const detail = String(error?.message ?? error).split('\n')[0];
        errors.push(`${leaf.path}:${start + 1}: mermaid diagram failed to parse: ${detail}`);
      }
      start = null;
    }
  }
  if (start !== null) errors.push(`${leaf.path}:${start + 1}: unterminated mermaid block.`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} mermaid error(s).`);
  process.exit(1);
}

console.log(`Parsed ${count} mermaid diagrams across ${leaves.length} leaves.`);
