/**
 * Checks the certification alignment in every leaf against
 * data/certifications.json, and summarises what the leaves cite.
 *
 * Certifications expire faster than anything else a leaf mentions. In one
 * summer Microsoft retired AI-102, AI-900, DP-100 and AZ-500, and AWS retired
 * the Machine Learning Specialty; 33 of 34 leaves pointed readers at an exam
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

const EVIDENCE = new Set(['read', 'search-extract', 'unverified']);
const REQUIRED = {
  credentials: ['id', 'vendor', 'credential', 'label', 'status', 'domains', 'source', 'evidence'],
  retired: ['code', 'names', 'retired', 'successor', 'source', 'evidence'],
};

export function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

/**
 * A malformed entry should fail with a sentence naming the field, not a
 * TypeError from deep inside the check. Returns errors; the leaf checks only
 * run on a registry that passes.
 */
export function checkRegistry(registry) {
  const errors = [];
  const ids = new Set();
  for (const [kind, fields] of Object.entries(REQUIRED)) {
    for (const [i, entry] of (registry[kind] ?? []).entries()) {
      const name = entry.id ?? entry.code ?? `#${i}`;
      for (const field of fields) {
        if (entry[field] === undefined) {
          errors.push(`${REGISTRY_PATH}: ${kind} entry ${name} has no "${field}".`);
        }
      }
      if (entry.evidence !== undefined && !EVIDENCE.has(entry.evidence)) {
        errors.push(
          `${REGISTRY_PATH}: ${kind} entry ${name} has evidence "${entry.evidence}"; ` +
            `use one of ${[...EVIDENCE].join(', ')}.`
        );
      }
      if (kind === 'credentials') ids.add(entry.id);
    }
  }
  for (const r of registry.retired ?? []) {
    if (r.successor && !ids.has(r.successor)) {
      errors.push(`${REGISTRY_PATH}: retired ${r.code} names successor "${r.successor}", which is not a credential id.`);
    }
  }
  const owasp = (registry.frameworks ?? []).find((f) => f.id === 'owasp-llm-top10');
  if (!owasp?.entries || !owasp.edition) {
    errors.push(`${REGISTRY_PATH}: frameworks has no owasp-llm-top10 entry with an edition and entries.`);
  }
  return errors;
}

/**
 * Every non-blank line of a leaf's `## Certification alignment` section. Not
 * only `- ` bullets: a `*` bullet or a numbered item is still a citation, and
 * collecting it is what lets the format check reject it.
 */
export function certificationLines(body) {
  const out = [];
  let inside = false;
  for (const [index, line] of body.split('\n').entries()) {
    if (line.startsWith('## ')) {
      inside = line.trim() === '## Certification alignment';
      continue;
    }
    if (inside && line.trim()) out.push({ line: index + 1, text: line });
  }
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Retired exams are matched loosely, because a reader is sent to a withdrawn
 * exam however it is spelled: any dash or whitespace between words (so a name
 * wrapped across two lines still matches), a code in any case, and a
 * Microsoft course code such as AI-102T00. Names stay case-sensitive so that
 * the role an exam was named after - "an Azure AI engineer" - is not flagged.
 */
function retiredPattern(text, isCode) {
  const words = text.split(/[\s\-–—]+/).map(escape);
  const body = words.join('[\\s\\-\\u2013\\u2014]*');
  const suffix = isCode ? '(?:T\\d\\d)?' : '';
  return new RegExp(`(?<![A-Za-z0-9])${body}${suffix}(?![A-Za-z0-9])`, isCode ? 'gi' : 'g');
}

/** The bold label of a line in the house format, or null if it is not in it. */
function labelOf(text) {
  const match = text.match(/^- \*\*(.+?)\*\* - \S/);
  return match ? match[1] : null;
}

/**
 * The credential whose canonical label this is. Exact equality, not a
 * substring search: a label that merely contains a registered name - or pairs
 * one with an unregistered credential - must not be credited to it.
 */
export function credentialFor(label, registry) {
  return registry.credentials.find((c) => c.label === label);
}

/** A registry domain without its weight: "Plan and manage ... (25-30%)" -> name. */
const domainName = (d) => d.replace(/\s*\([^)]*%\)\s*$/, '');

/**
 * Returns error strings. Rules, each applied to every leaf:
 *
 * 1. No leaf names a retired exam, anywhere in its body - prose that sends a
 *    reader to a withdrawn exam is as stale as a bullet that does.
 * 2. Every alignment line is `- **Label** - what it covers`.
 * 3. Every label is `Vendor-neutral` or exactly a registered credential's label.
 * 4. Where the registry records a credential's official domains, the line
 *    opens with one of them, so the claim can be checked against the vendor's
 *    own study guide.
 * 5. Every OWASP LLM Top 10 ID carries its edition and names the entry that
 *    ID has in it, because OWASP renumbers the list between editions.
 */
export function checkCertifications(catalog, registry = loadRegistry()) {
  const registryErrors = checkRegistry(registry);
  if (registryErrors.length) return registryErrors;

  const errors = [];
  const byId = new Map(registry.credentials.map((c) => [c.id, c]));
  const retired = registry.retired.map((r) => ({
    ...r,
    patterns: [retiredPattern(r.code, true), ...r.names.map((n) => retiredPattern(n, false))],
    successorName: byId.get(r.successor)?.label ?? r.successor,
  }));
  const owasp = registry.frameworks.find((f) => f.id === 'owasp-llm-top10');

  for (const leaf of catalog.leaves) {
    if (!fs.existsSync(leaf.path)) continue;
    const body = fs.readFileSync(leaf.path, 'utf8');
    const lineAt = (offset) => body.slice(0, offset).split('\n').length;

    for (const r of retired) {
      const seen = new Set();
      for (const pattern of r.patterns) {
        for (const m of body.matchAll(pattern)) {
          const line = lineAt(m.index);
          if (seen.has(line)) continue;
          seen.add(line);
          errors.push(
            `${leaf.path}:${line} names ${r.code} ("${m[0].replace(/\s+/g, ' ')}"), retired ${r.retired}. ` +
              `Cite ${r.successorName} instead (source: ${r.source}).`
          );
        }
      }
    }

    // Any spelling of an ID is caught - LLM08, LLM-08, LLM 8, llm08 - and
    // only the canonical `LLM08:2026 Name` form passes.
    for (const m of body.matchAll(/\bLLM[- ]?(\d{1,2})\b(?::(\d{4}))?\s*((?:(?!LLM[- ]?\d)[A-Za-z ])*)/gi)) {
      const id = `LLM${m[1].padStart(2, '0')}`;
      const expected = owasp.entries[id];
      const named = (m[3] ?? '').trim().toLowerCase();
      const canonical = m[0].startsWith(`${id}:${owasp.edition}`);
      if (expected && canonical && named.startsWith(expected.toLowerCase())) continue;
      const right = Object.entries(owasp.entries).find(
        ([, name]) => named && named.startsWith(name.toLowerCase())
      );
      errors.push(
        `${leaf.path}:${lineAt(m.index)} cites ${m[0].trim()}. In the ${owasp.name} ${owasp.edition}, ` +
          (expected ? `${id} is ${expected}` : `there is no ${id}`) +
          (right && right[0] !== id ? `; ${right[1]} is ${right[0]}:${owasp.edition}` : '') +
          `. Write it as ${right ? right[0] : 'LLMnn'}:${owasp.edition} <name> (source: ${owasp.source}).`
      );
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
      const credential = credentialFor(label, registry);
      if (!credential) {
        errors.push(
          `${leaf.path}:${line} cites "${label}", which is not a label in ${REGISTRY_PATH}. ` +
            'Use a registered label exactly, add the credential with its source and evidence, ' +
            'or label the line Vendor-neutral.'
        );
        continue;
      }
      if (credential.domains.length) {
        const claim = text.replace(/^- \*\*.+?\*\* - /, '');
        const names = credential.domains.map(domainName);
        if (!names.some((n) => claim.startsWith(`${n}:`))) {
          errors.push(
            `${leaf.path}:${line} cites ${credential.label} without opening on one of its official ` +
              `domains, followed by a colon: ${names.join('; ')}.`
          );
        }
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
