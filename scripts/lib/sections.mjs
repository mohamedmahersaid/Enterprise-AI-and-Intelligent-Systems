/**
 * The fence-aware line parse validate-content is built on, and the section
 * depth CONTRIBUTING promises, as pure functions so test/ can exercise them.
 *
 * The parse recognises the same fences readiness.mjs does - backtick or tilde,
 * three or more, indented or not, closed only by its own marker - because two
 * parsers that disagree are a bypass: a `## Lab` heading inside a ~~~ fence
 * used to count as the section itself.
 */

/** Split a markdown file into lines, flagging those inside fenced code blocks. */
export function parseLines(content) {
  let fence = null;
  return content.split('\n').map((text) => {
    const open = text.match(/^\s*(`{3,}|~{3,})/);
    if (!fence && open) {
      fence = open[1];
      return { text, fenced: true };
    }
    if (fence && text.trim().startsWith(fence)) {
      fence = null;
      return { text, fenced: true };
    }
    return { text, fenced: fence !== null };
  });
}

/**
 * The depth CONTRIBUTING promises inside three of the required sections, so
 * "match that depth rather than the headings alone" is a check, not a plea:
 *
 * - Troubleshooting: five scenarios, each an `### Scenario N:` with a
 *   `**Likely cause:**` and a `**Resolution:**`.
 * - Interview questions: four, each an H3.
 * - Lab: validation criteria, as its `### Validation` subsection.
 *
 * Exactly what CONTRIBUTING states and every leaf ships - no invented floor.
 * `headings` come from the fence-aware parse: {level, text, line}.
 */
export function checkSectionDepth(file, headings, lines) {
  const errors = [];

  const subsections = (name) => {
    const start = headings.findIndex((h) => h.level === 2 && h.text === name);
    if (start === -1) return null; // the missing section is already reported
    let end = headings.length;
    for (let i = start + 1; i < headings.length; i++) {
      if (headings[i].level <= 2) { end = i; break; }
    }
    return {
      h3s: headings.slice(start + 1, end).filter((h) => h.level === 3),
      last: (headings[end] ?? { line: lines.length }).line,
    };
  };

  const troubleshooting = subsections('Troubleshooting');
  if (troubleshooting) {
    const scenarios = troubleshooting.h3s.filter((h) => /^Scenario \d+:/.test(h.text));
    if (scenarios.length < 5) {
      errors.push(
        `${file}: Troubleshooting has ${scenarios.length} "### Scenario N:" subsection(s); ` +
          'CONTRIBUTING promises five scenarios.'
      );
    }
    for (const [i, scenario] of scenarios.entries()) {
      const to = scenarios[i + 1]?.line ?? troubleshooting.last;
      const body = lines.slice(scenario.line + 1, to);
      for (const marker of ['**Likely cause:**', '**Resolution:**']) {
        if (!body.some((l) => !l.fenced && l.text.startsWith(marker))) {
          errors.push(`${file}:${scenario.line + 1}: "${scenario.text}" has no ${marker} line.`);
        }
      }
    }
  }

  const interview = subsections('Interview questions');
  if (interview && interview.h3s.length < 4) {
    errors.push(
      `${file}: Interview questions has ${interview.h3s.length} question(s); CONTRIBUTING promises four.`
    );
  }

  const lab = subsections('Lab');
  if (lab && !lab.h3s.some((h) => h.text === 'Validation')) {
    errors.push(
      `${file}: Lab has no "### Validation" subsection; CONTRIBUTING promises validation criteria ` +
        'stating evidence rather than activity.'
    );
  }

  return errors;
}
