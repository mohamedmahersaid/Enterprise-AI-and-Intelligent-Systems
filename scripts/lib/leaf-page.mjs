/**
 * What a leaf page shows beyond its markdown - the reading order, the facts
 * panel's inputs and the "On this page" list - as pure functions so test/ can
 * exercise them without building the site.
 */

import { parseLines } from './sections.mjs';
import { slug } from './derive.mjs';

/** The reading order of the levels; the catalog stores no rank of its own. */
export const LEVEL_ORDER = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Enterprise'];

/**
 * The pager's sequence: every Beginner leaf before the first Intermediate
 * one, and catalog order within a level, so "next" always continues at the
 * reader's level or steps up - not sideways into another tree's deep end.
 */
export function levelOrdered(leaves) {
  const rank = new Map(LEVEL_ORDER.map((level, i) => [level, i]));
  return [...leaves].sort((a, b) => (rank.get(a.level) ?? LEVEL_ORDER.length) - (rank.get(b.level) ?? LEVEL_ORDER.length));
}

/**
 * Drops the run-on metadata block under the H1 - the `**Level:** ...` lines
 * every leaf carries for GitHub readers - so the site can state the same
 * facts once, as its facts panel, instead of twice. Anything that is not
 * exactly that block is left alone.
 */
export function stripHeaderBlock(markdown) {
  const lines = markdown.split('\n');
  const h1 = lines.findIndex((line) => line.startsWith('# '));
  if (h1 === -1) return markdown;
  let start = h1 + 1;
  while (start < lines.length && !lines[start].trim()) start++;
  let end = start;
  while (end < lines.length && /^\*\*[^*]+:\*\*/.test(lines[end])) end++;
  if (end === start) return markdown;
  while (end < lines.length && !lines[end].trim()) end++;
  return [...lines.slice(0, h1 + 1), '', ...lines.slice(end)].join('\n');
}

/**
 * The H2 headings outside code fences, with the ids the page's renderer gives
 * them (both sides use the same slug), so an "On this page" link always
 * resolves - scripts/check-site.mjs fails the build when a fragment does not.
 */
export function tocOf(markdown) {
  const out = [];
  for (const line of parseLines(markdown)) {
    if (line.fenced) continue;
    const m = line.text.match(/^##\s+(.+?)\s*$/);
    if (m) out.push({ text: m[1], id: slug(m[1]) });
  }
  return out;
}
