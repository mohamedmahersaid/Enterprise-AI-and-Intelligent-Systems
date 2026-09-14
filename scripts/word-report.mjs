// Reports the word-count distribution across every leaf, by level.
//
// Deliberately a report and not a gate. A hard word-count check would be easy
// to add and actively harmful: it rewards padding a thin section to clear a
// floor and cutting a necessary one to duck a ceiling, which is the opposite
// of what the band in CONTRIBUTING.md is for. The number is a symptom of
// covering the ten sections properly. This prints the symptom; a human reads it.
import { readFileSync } from 'node:fs';
import { readCatalog } from './lib/derive.mjs';

// Frontmatter is metadata, not prose, so it is stripped. Fenced code is kept:
// the commands and scripts are content a reader works through, not decoration.
function countWords(file) {
  const text = readFileSync(file, 'utf8').replace(/^---\n.*?\n---\n/s, '');
  return text.split(/\s+/).filter(Boolean).length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

const counted = readCatalog().leaves.map((leaf) => ({ ...leaf, words: countWords(leaf.path) }));
counted.sort((a, b) => a.words - b.words);

const byLevel = new Map();
for (const leaf of counted) {
  if (!byLevel.has(leaf.level)) byLevel.set(leaf.level, []);
  byLevel.get(leaf.level).push(leaf.words);
}

const all = counted.map((leaf) => leaf.words);
console.log(`${all.length} leaves: ${all[0]}-${all[all.length - 1]} words, median ${median(all)}\n`);

console.log('level          n    min  median    max');
const levels = [...byLevel.entries()].sort((a, b) => median(b[1]) - median(a[1]));
for (const [level, words] of levels) {
  const sorted = [...words].sort((a, b) => a - b);
  console.log(
    `${level.padEnd(13)} ${String(words.length).padStart(2)} ` +
    `${String(sorted[0]).padStart(6)} ${String(median(words)).padStart(7)} ` +
    `${String(sorted[sorted.length - 1]).padStart(6)}`,
  );
}

if (process.argv.includes('--all')) {
  console.log('\nwords  leaf');
  for (const leaf of counted) console.log(`${String(leaf.words).padStart(5)}  ${leaf.path}`);
}
