/**
 * Derives the version assumptions the curriculum makes, from the curriculum.
 *
 * The leaves pin things that expire. A model tag is withdrawn, an Azure API
 * version is superseded, a CLI renames a flag - and the content goes quietly
 * wrong. Nothing recorded what any leaf depended on, so a reader hitting a
 * failure could not tell whether they had made a mistake or the world had
 * moved. That is the gap this closes.
 *
 * What is recorded is deliberately narrow: WHAT THE REPOSITORY ASSUMES, read
 * out of the repository. It is not, and must not be presented as, a claim that
 * any of it is current. Confirming that a model tag still exists requires
 * asking the vendor, which no build step here can do - so the generated
 * document says so plainly rather than implying a validation that never
 * happened. A false "verified" is worse than an honest "unverified".
 *
 * The pinned artefacts and tools are extracted, never hand-maintained, so they
 * cannot drift from the content the way a hand-written list would. The one
 * hand-maintained input is data/certifications.json, whose facts were looked
 * up and which records, per entry, how well; its section says so. `npm run
 * regen` writes the document; validate-content asserts it is in step, the same
 * contract PATHS.md has.
 */
import fs from 'node:fs';
import { citations, loadRegistry } from './certifications.mjs';
import { commandTools } from './readiness.mjs';

/**
 * Command names worth declaring, mapped to what a reader must obtain.
 * Shell builtins and text-mangling utilities are omitted on purpose: `grep`
 * tells a reader nothing about what to install, while `az` tells them
 * everything.
 */
const TOOLS = {
  az: 'Azure CLI',
  kubectl: 'kubectl',
  helm: 'Helm',
  ollama: 'Ollama',
  vllm: 'vLLM',
  mlflow: 'MLflow',
  feast: 'Feast',
  promptfoo: 'promptfoo',
  ray: 'Ray',
  docker: 'Docker',
  terraform: 'Terraform',
  psql: 'psql (PostgreSQL client)',
  'nvidia-smi': 'NVIDIA driver and CUDA runtime',
  curl: 'curl',
  jq: 'jq',
  git: 'git',
  python: 'Python 3',
  python3: 'Python 3',
  pip: 'pip',
};

/**
 * Pinned artefacts, grouped by the question a reader asks when one breaks.
 * Each pattern targets something a vendor can withdraw or supersede. Anything
 * that cannot expire does not belong here - an inventory that lists everything
 * is read by nobody.
 */
const PINNED = [
  {
    id: 'azure-api-version',
    label: 'Azure REST API versions',
    // Each Azure service versions its REST API independently, so the service
    // is captured alongside the date. An earlier version of this file labelled
    // every match "Azure OpenAI", which made three unrelated services look
    // like one inconsistency and invited an "alignment" that would have broken
    // all three. The service name is what makes the row actionable.
    note:
      'Each service versions independently - a date that differs between ' +
      'services is expected, not a mismatch. Superseded versions keep working ' +
      'for a time and are then withdrawn.',
    pattern:
      /(?:\/(openai)\/|\/(contentsafety)\/|\/(indexes)\/)[^"'\s]*?api-version=([0-9]{4}-[0-9]{2}-[0-9]{2}(?:-preview)?)/g,
    format: (m) => {
      const service = m[1]
        ? 'Azure OpenAI'
        : m[2]
          ? 'Azure AI Content Safety'
          : 'Azure AI Search';
      return `${service} ${m[4]}`;
    },
  },
  {
    id: 'azure-openai-v1',
    label: 'Azure OpenAI API surface',
    note:
      'The v1 API carries no date version: calls go to /openai/v1/ and name ' +
      'the deployment in the body. It follows the service lifecycle rather ' +
      'than a pinned date, so a breaking change arrives as a new path.',
    pattern: /\/openai\/(v1)\//g,
    format: () => 'Azure OpenAI v1',
  },
  {
    id: 'azure-model-version',
    label: 'Azure OpenAI model versions pinned by deployment commands',
    note:
      'These are what the Microsoft Foundry model retirement schedule is keyed ' +
      'on. A version listed as Deprecated there can no longer be deployed by a ' +
      'new subscription, and a Retired one answers every request with 410 Gone.',
    pattern: /--model-name\s+(\S+)\s+--model-version\s+(\S+)/g,
    format: (m) => `${m[1]} ${m[2]}`,
  },
  {
    id: 'azure-model',
    label: 'Azure OpenAI model names',
    note: 'Deployment names are chosen locally; these are the underlying models.',
    pattern:
      /\b(gpt-(?:4o|4\.1|5(?:\.\d+)?)(?:-(?:mini|nano|pro|chat|codex))?|text-embedding-3(?:-[a-z]+)?)\b/g,
  },
  {
    id: 'ollama-model',
    label: 'Ollama model tags',
    note: 'Tags are withdrawn and re-pointed upstream; a pull can fail or change.',
    pattern: /\b([a-z0-9.]+:\d+b(?:-[a-z0-9_]+)*)\b/g,
  },
  {
    id: 'container-image',
    label: 'Container images',
    note: 'Base images are rebuilt and old tags eventually stop being published.',
    pattern: /\b(nvidia\/cuda:[0-9][0-9a-z.\-]*)\b/g,
  },
];

/**
 * The tools a leaf's own commands invoke, in stable order. Every command in a
 * line counts - `TOKEN=$(az ...)`, `jq ... | curl ...` - not only the first
 * word, or a leaf whose commands open with an assignment or a pipe would be
 * listed as needing less than it does.
 */
function toolsFor(body) {
  const found = new Set();
  for (const tool of commandTools(body)) {
    if (TOOLS[tool]) found.add(TOOLS[tool]);
  }
  return [...found].sort();
}

/**
 * Builds the inventory. Returns leaves in catalog order and pinned artefacts
 * grouped by kind, each carrying the leaves that mention it so a reader
 * chasing one expiry knows exactly what it affects.
 */
export function deriveAssumptions(catalog) {
  const leaves = [];
  const pinned = new Map(PINNED.map((p) => [p.id, new Map()]));

  for (const leaf of catalog.leaves) {
    if (!fs.existsSync(leaf.path)) continue;
    const body = fs.readFileSync(leaf.path, 'utf8');
    leaves.push({ id: leaf.id, name: leaf.name, tools: toolsFor(body) });

    for (const spec of PINNED) {
      // Patterns are global; reset lastIndex so reuse across leaves is safe.
      spec.pattern.lastIndex = 0;
      for (const match of body.matchAll(spec.pattern)) {
        const value = spec.format ? spec.format(match) : match[1];
        const bucket = pinned.get(spec.id);
        if (!bucket.has(value)) bucket.set(value, new Set());
        bucket.get(value).add(leaf.id);
      }
    }
  }

  const registry = loadRegistry();
  return {
    leaves,
    certifications: {
      verified: registry.verified,
      cited: citations(catalog, registry).filter((c) => c.leaves.length),
      retired: registry.retired.map((r) => ({
        ...r,
        successorName:
          registry.credentials.find((c) => c.id === r.successor)?.credential ?? r.successor,
        evidence: r.evidence,
      })),
      frameworks: registry.frameworks,
    },
    pinned: PINNED.map((spec) => ({
      ...spec,
      values: [...pinned.get(spec.id).entries()]
        .map(([value, ids]) => ({ value, leaves: [...ids].sort() }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    })),
  };
}

/** Renders the document. Pure function of the inventory, so it is stable. */
export function renderAssumptionsMd(data) {
  const lines = [];
  lines.push('# Version assumptions');
  lines.push('');
  lines.push(
    'Generated by `npm run regen` from the leaves themselves. Do not edit by hand.'
  );
  lines.push('');
  lines.push('## What this is, and what it is not');
  lines.push('');
  lines.push(
    'This records **what the curriculum assumes**, extracted from the commands ' +
    'the leaves actually ship. It is **not** a statement that any of it is ' +
    'current.'
  );
  lines.push('');
  lines.push(
    'The pinned artefacts and tools below have not been checked against a ' +
    'vendor. Confirming that a model tag still exists, or that an API version ' +
    'has not been withdrawn, means asking the vendor - which no check in this ' +
    'repository can do. Treat those rows as **unverified**, and verify the ones ' +
    'you depend on before relying on them in production. The certifications ' +
    'section is the exception: it comes from a hand-maintained registry whose ' +
    'entries were looked up, and it states how well for each one.'
  );
  lines.push('');
  lines.push(
    'The value of the list is that it makes the assumptions visible. A reader ' +
    'whose command fails can see what the leaf expected and decide whether ' +
    'they made a mistake or the world moved.'
  );
  lines.push('');

  lines.push('## Pinned artefacts');
  lines.push('');
  lines.push('These are the things a vendor can withdraw or supersede.');
  lines.push('');
  for (const spec of data.pinned) {
    lines.push(`### ${spec.label}`);
    lines.push('');
    lines.push(spec.note);
    lines.push('');
    if (!spec.values.length) {
      lines.push('None found.');
      lines.push('');
      continue;
    }
    lines.push('| Value | Used by |');
    lines.push('| --- | --- |');
    for (const { value, leaves } of spec.values) {
      lines.push(`| \`${value}\` | ${leaves.map((id) => `\`${id}\``).join(', ')} |`);
    }
    lines.push('');
  }

  lines.push('## Certifications cited');
  lines.push('');
  lines.push(
    `From \`data/certifications.json\`, last checked against vendor sources on ` +
    `${data.certifications.verified}. Unlike the rows above, these were looked up - ` +
    'but only as well as the evidence column says. **read**: the vendor page was ' +
    'fetched and read. **search-extract**: the vendor blocked the checker, and the ' +
    "facts come from search-engine extracts of the vendor's own pages. " +
    '**unverified**: no vendor text could be read; the citation is kept as written.'
  );
  lines.push('');
  lines.push('| Credential | Status | Evidence | Cited by |');
  lines.push('| --- | --- | --- | --- |');
  for (const c of data.certifications.cited) {
    lines.push(
      `| [${c.credential}](${c.source}) | ${c.status} | ${c.evidence} | ` +
      `${c.leaves.map((id) => `\`${id}\``).join(', ')} |`
    );
  }
  lines.push('');
  lines.push('No leaf may cite these; validate-content fails if one does.');
  lines.push('');
  lines.push('| Retired exam | Retired | Replaced by | Evidence |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of data.certifications.retired) {
    lines.push(`| [${r.code}](${r.source}) | ${r.retired} | ${r.successorName} | ${r.evidence} |`);
  }
  lines.push('');
  lines.push(
    'Numbered frameworks the leaves cite by ID. An ID is only meaningful with its ' +
    'edition, so validate-content requires both.'
  );
  lines.push('');
  lines.push('| Framework | Edition | Released | Evidence |');
  lines.push('| --- | --- | --- | --- |');
  for (const f of data.certifications.frameworks) {
    lines.push(`| [${f.name}](${f.source}) | ${f.edition} | ${f.released} | ${f.evidence} |`);
  }
  lines.push('');

  lines.push('## Tools each leaf expects');
  lines.push('');
  lines.push(
    'Derived from the leading command in every `text` block. A leaf listing a ' +
    'tool assumes the reader can install it and has whatever access it needs.'
  );
  lines.push('');
  lines.push('| Leaf | Expects |');
  lines.push('| --- | --- |');
  for (const leaf of data.leaves) {
    lines.push(`| \`${leaf.id}\` | ${leaf.tools.join(', ') || '—'} |`);
  }
  lines.push('');

  return lines.join('\n');
}
