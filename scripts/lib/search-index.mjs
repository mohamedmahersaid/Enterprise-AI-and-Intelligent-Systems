/**
 * What the site's search knows about a leaf, as pure functions so test/ can
 * exercise them.
 *
 * The index used to carry only the catalog row - name, level, branch - so a
 * reader could find a leaf they could already name, and nothing else. A
 * reader's real query is a concept ("point-in-time", "qrels", "keep_alive"),
 * and the places a concept lives are the leaf's headings, the opening of its
 * Explanation, and the tools and needs its commands prove. Those go into the
 * haystack; the whole body does not, because the index is one file every page
 * downloads on first keystroke, and it has a byte budget the build enforces.
 */

import { parseLines } from './sections.mjs';
import { commandTools, NEEDS, LEVELS } from './readiness.mjs';

/**
 * One file, fetched by the first keystroke on every page: at 128 KiB it is
 * still smaller than a single leaf page. The build fails when the index
 * outgrows it, so growth is a reviewed decision rather than a slow leak.
 */
export const INDEX_BUDGET_BYTES = 128 * 1024;

/** Every H2/H3 heading text outside code fences, without the leading #s. */
export function headingTexts(body) {
  const out = [];
  for (const line of parseLines(body)) {
    if (line.fenced) continue;
    const m = line.text.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (m) out.push(m[2]);
  }
  return out;
}

/** Inline markdown down to its text: links and images to their labels, emphasis and code marks dropped. */
function plainText(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first paragraph of the "## Explanation" section: the sentences an
 * author wrote to say what the leaf is and why it matters, which is exactly
 * what a search result and a meta description should say. Many leaves open
 * the section with an H3 before any prose, so subheadings are skipped; the
 * next H2 ends the section. Empty when the section is missing (branch and
 * tree README pages have none).
 */
export function explanationParagraph(body) {
  const lines = parseLines(body);
  const start = lines.findIndex((l) => !l.fenced && /^##\s+Explanation\s*$/.test(l.text));
  if (start === -1) return '';
  const paragraph = [];
  for (let i = start + 1; i < lines.length; i++) {
    const { text, fenced } = lines[i];
    if (!fenced && /^##\s/.test(text)) break;
    const skip = fenced || !text.trim() || /^#{3,6}\s/.test(text);
    if (!skip) paragraph.push(text.trim());
    else if (paragraph.length) break;
  }
  return plainText(paragraph.join(' '));
}

/** Clamped at a word boundary, with an ellipsis only when something was cut. */
export function snippet(text, max = 160) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return `${cut.slice(0, at > 0 ? at : max).replace(/[,;:.]$/, '')}…`;
}

/**
 * The searched text: every source lowercased, split into words, and each word
 * kept once. Search matches terms independently, so word order and repeats
 * buy nothing, and dropping them keeps the whole index inside the budget.
 */
export function haystack(parts) {
  const words = new Set();
  for (const part of parts) {
    for (const word of String(part ?? '').toLowerCase().split(/[^a-z0-9./:_@-]+/)) {
      if (word) words.add(word);
    }
  }
  return [...words].join(' ');
}

/** The index entry for one leaf, from its catalog row and its markdown body. */
export function searchEntry(leaf, body) {
  const explanation = explanationParagraph(body);
  return {
    title: leaf.name,
    level: leaf.level,
    readiness: LEVELS[leaf.readiness].label,
    branch: leaf.branch,
    url: leaf.path.replace(/\.md$/, '.html'),
    description: snippet(explanation),
    haystack: haystack([
      leaf.name,
      leaf.level,
      LEVELS[leaf.readiness].label,
      leaf.tree,
      leaf.branch,
      leaf.id,
      ...(Array.isArray(leaf.needs) ? leaf.needs.map((n) => NEEDS[n]?.label ?? n) : []),
      ...commandTools(body),
      ...headingTexts(body),
      explanation,
    ]),
  };
}

/** Why the serialized index breaks its budget, or null while it fits. */
export function indexSizeProblem(json, budget = INDEX_BUDGET_BYTES) {
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes <= budget) return null;
  return (
    `search-index.json is ${bytes} bytes, over its ${budget}-byte budget; ` +
    'trim what searchEntry indexes (or raise INDEX_BUDGET_BYTES deliberately in review).'
  );
}
