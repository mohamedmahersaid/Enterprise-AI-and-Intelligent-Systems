/**
 * Checks that every leaf reference can be followed.
 *
 * The references once named sources without linking them - "Microsoft Learn -
 * Azure OpenAI quotas" - so a reader could not tell which page was meant, and
 * nobody could tell whether the page still existed. Every entry now carries the
 * URL it was resolved to, and this makes that the rule rather than the habit.
 *
 * This is the offline half, run on every pull request: shape only, no network.
 * scripts/check-links.mjs is the online half, run on a schedule, which confirms
 * each URL still answers and records the title of the page it reaches.
 */
import fs from 'node:fs';

// One level of nesting is allowed in both: a title can contain [brackets] and a
// URL can contain (parentheses), as Wikipedia disambiguation pages do.
const ENTRY = /^- \[(?<text>(?:[^\[\]]|\[[^\[\]]*\])+)\]\((?<url>(?:[^()\s]|\([^()\s]*\))+)\) - (?<why>\S.*)$/;

/** The bullet lines of a leaf's `## References` section. */
export function referenceLines(body) {
  const out = [];
  let inside = false;
  let fenced = false;
  for (const [index, line] of body.split('\n').entries()) {
    // A `## References` inside a code block is example text, not a heading.
    if (line.trimStart().startsWith('```')) fenced = !fenced;
    if (!fenced && line.startsWith('## ')) {
      inside = line.trim() === '## References';
      continue;
    }
    if (inside && line.trim()) out.push({ line: index + 1, text: line });
  }
  return out;
}

/**
 * Every entry is `- [Publisher: Title](https://...) - what the leaf uses it for.`,
 * over https, and no URL appears twice in one leaf. A leaf with no references
 * section is already reported by the required-sections check.
 */
export function checkReferences(catalog) {
  const errors = [];
  for (const leaf of catalog.leaves) {
    if (!fs.existsSync(leaf.path)) continue;
    const seen = new Map();
    const lines = referenceLines(fs.readFileSync(leaf.path, 'utf8'));
    if (!lines.length) {
      errors.push(`${leaf.path}: the References section lists nothing.`);
    }
    for (const { line, text } of lines) {
      const m = text.match(ENTRY);
      if (!m) {
        errors.push(
          `${leaf.path}:${line} reference is not in the form ` +
            '`- [Publisher: Title](https://...) - what the leaf uses it for.`'
        );
        continue;
      }
      const { url } = m.groups;
      if (!url.startsWith('https://')) {
        errors.push(`${leaf.path}:${line} reference URL is not https: ${url}`);
      }
      if (seen.has(url)) {
        errors.push(`${leaf.path}:${line} cites ${url} again (first at line ${seen.get(url)}).`);
      } else {
        seen.set(url, line);
      }
    }
  }
  return errors;
}
