/**
 * Checks the certification alignment in every leaf against
 * data/certifications.json, and summarises what the leaves cite.
 *
 * Certifications expire faster than anything else a leaf mentions. In one
 * summer Microsoft retired AI-102, AI-900, DP-100 and AZ-500, and AWS retired
 * the Machine Learning Specialty; 32 of 34 leaves pointed readers at an exam
 * they could no longer sit, and nothing noticed. The registry records what is
 * current and where that was read, so the check below can fail the moment a
 * leaf names a retired exam or cites a credential nobody has looked up.
 *
 * The registry is maintained by hand: no build step can ask a vendor whether
 * an exam still exists. Each entry says how its facts were obtained, and the
 * generated summary repeats that, rather than presenting every row as equally
 * certain.
 */
import fs from 'node:fs';

export const REGISTRY_PATH = 'data/certifications.json';

export function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

/** The bullet lines of a leaf's `## Certification alignment` section. */
export function certificationLines(body) {
  const lines = body.split('\n');
  const out = [];
  let inside = false;
  for (const [index, line] of lines.entries()) {
    if (line.startsWith('## ')) {
      inside = line.trim() === '## Certification alignment';
      continue;
    }
    if (inside && line.startsWith('- ')) out.push({ line: index + 1, text: line });
  }
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const codePattern = (code) => new RegExp(`(?<![A-Za-z0-9-])${escape(code)}(?![A-Za-z0-9])`);

/** The bold label of a line in the house format, or null if it is not in it. */
function labelOf(text) {
  const match = text.match(/^- \*\*(.+?)\*\* - \S/);
  return match ? match[1] : null;
}

/** The registry credential a label names, if any. */
export function credentialFor(label, registry) {
  return registry.credentials.find((c) => c.match.some((m) => codePattern(m).test(label)));
}

/**
 * Returns error strings for every leaf. Three rules:
 *
 * 1. No leaf names a retired exam, anywhere in its body - prose that sends a
 *    reader to a withdrawn exam is as stale as a bullet that does.
 * 2. Every alignment line is `- **Label** - what it covers`, so the claim and
 *    the credential are separable and every leaf reads the same way.
 * 3. Every label is `Vendor-neutral` or names a credential in the registry,
 *    so citing something new means recording where its status was read.
 *
 * And one for the OWASP LLM Top 10, cited by ID across the leaves: each ID
 * carries its edition and names the entry that ID has in it.
 */
export function checkCertifications(catalog, registry = loadRegistry()) {
  const errors = [];
  const retired = registry.retired.map((r) => ({
    ...r,
    patterns: [codePattern(r.code), ...r.names.map((n) => codePattern(n))],
    successorName:
      registry.credentials.find((c) => c.id === r.successor)?.credential ?? r.successor,
  }));

  const owasp = registry.frameworks.find((f) => f.id === 'owasp-llm-top10');

  for (const leaf of catalog.leaves) {
    if (!fs.existsSync(leaf.path)) continue;
    const body = fs.readFileSync(leaf.path, 'utf8');
    const lines = body.split('\n');

    // OWASP renumbers its LLM Top 10 between editions - Excessive Agency was
    // LLM08 in 2023 and is LLM03 in 2026 - so a bare ID silently changes
    // meaning. Every ID must carry its edition and name its entry in it.
    for (const [index, line] of lines.entries()) {
      for (const m of line.matchAll(/\bLLM(0[1-9]|10)(?::(\d{4}))?\s*((?:(?!LLM\d)[A-Za-z ])*)/g)) {
        const id = `LLM${m[1]}`;
        const expected = owasp.entries[id];
        const named = (m[3] ?? '').trim().toLowerCase();
        if (m[2] !== owasp.edition || !named.startsWith(expected.toLowerCase())) {
          const right = Object.entries(owasp.entries).find(
            ([, name]) => named && named.startsWith(name.toLowerCase().split(' ')[0])
          );
          errors.push(
            `${leaf.path}:${index + 1} cites ${m[0].trim()}. In the ${owasp.name} ${owasp.edition}, ` +
              `${id} is ${expected}` +
              (right ? `; ${right[1]} is ${right[0]}:${owasp.edition}` : '') +
              `. Write it as ${right ? right[0] : id}:${owasp.edition} <name> (source: ${owasp.source}).`
          );
        }
      }
    }

    for (const r of retired) {
      for (const [index, line] of lines.entries()) {
        if (r.patterns.some((p) => p.test(line))) {
          errors.push(
            `${leaf.path}:${index + 1} names ${r.code}, retired ${r.retired}. ` +
              `Cite ${r.successorName} instead (source: ${r.source}).`
          );
        }
      }
    }

    for (const { line, text } of certificationLines(body)) {
      const label = labelOf(text);
      if (!label) {
        errors.push(
          `${leaf.path}:${line} certification line is not in the form ` +
            '`- **Credential** - what the leaf covers`.'
        );
        continue;
      }
      if (label === 'Vendor-neutral') continue;
      if (!credentialFor(label, registry)) {
        errors.push(
          `${leaf.path}:${line} cites "${label}", which ${REGISTRY_PATH} does not list. ` +
            'Add it with its source and how its status was verified, or label the line Vendor-neutral.'
        );
      }
    }
  }
  return errors;
}

/** Which leaves cite each registry credential, for the generated summary. */
export function citations(catalog, registry = loadRegistry()) {
  const byId = new Map(registry.credentials.map((c) => [c.id, new Set()]));
  for (const leaf of catalog.leaves) {
    if (!fs.existsSync(leaf.path)) continue;
    for (const { text } of certificationLines(fs.readFileSync(leaf.path, 'utf8'))) {
      const label = labelOf(text);
      const credential = label && credentialFor(label, registry);
      if (credential) byId.get(credential.id).add(leaf.id);
    }
  }
  return registry.credentials.map((c) => ({ ...c, leaves: [...byId.get(c.id)].sort() }));
}
