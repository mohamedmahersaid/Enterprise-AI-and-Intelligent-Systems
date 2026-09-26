/**
 * Asks the Ollama registry whether every model tag the curriculum pins still
 * exists, and records the digest each one resolves to today.
 *
 * ASSUMPTIONS.md lists the tags the leaves pull, and says plainly that it
 * cannot confirm any of them is still published. This is the half that can:
 * it needs the network, so it runs on a schedule and on demand rather than on
 * every pull request, the same split as the link check.
 *
 * The tags are read from the same derivation that writes ASSUMPTIONS.md, so a
 * tag added to a leaf is checked without being listed anywhere else. An
 * untagged pull is checked as `latest`, which is what it resolves to.
 *
 *   ok          the registry serves a manifest for the tag
 *   broken      404 - the tag is gone or was never published; the run fails
 *   unconfirmed anything else - the registry refused or failed us
 *
 * Usage: node scripts/check-ollama-tags.mjs [--json report.json]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { deriveAssumptions } from './lib/assumptions.mjs';

const REGISTRY = 'https://registry.ollama.ai/v2/library';
const TIMEOUT_MS = 20_000;

const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const pinned = deriveAssumptions(catalog).pinned.find((p) => p.id === 'ollama-model');

/** "qwen2.5:7b-instruct-q4_K_M" or "nomic-embed-text (untagged ...)" -> [name, tag]. */
function parse(value) {
  const ref = value.split(' ')[0];
  const [name, tag = 'latest'] = ref.split(':');
  return { name, tag, ref: `${name}:${tag}` };
}

async function probe({ name, tag }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${REGISTRY}/${name}/manifests/${tag}`, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.docker.distribution.manifest.v2+json' },
    });
    // The registry does not always send Docker-Content-Digest; a manifest's
    // digest is by definition the sha256 of its bytes, so compute it.
    const body = Buffer.from(await res.arrayBuffer());
    const digest = res.status === 200
      ? res.headers.get('docker-content-digest') ?? `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`
      : '';
    return { status: res.status, digest };
  } catch (error) {
    return { status: 0, digest: '', error: error.cause?.code ?? error.name };
  } finally {
    clearTimeout(timer);
  }
}

const verdict = ({ status }) => (status === 200 ? 'ok' : status === 404 ? 'broken' : 'unconfirmed');

const results = [];
for (const { value, leaves } of pinned?.values ?? []) {
  const tag = parse(value);
  const r = await probe(tag);
  results.push({ ...tag, leaves, ...r, verdict: verdict(r) });
}

if (!results.length) {
  // Zero tags means the extraction broke, not that everything is current.
  console.error('No Ollama tags found in the leaves - the extraction is broken.');
  process.exit(1);
}

const count = (v) => results.filter((r) => r.verdict === v).length;
const md = [
  '## Ollama model tags',
  '',
  `${results.length} tags: ${count('ok')} ok, ${count('unconfirmed')} unconfirmed, ${count('broken')} broken.`,
  '',
  '| Verdict | Tag | Status | Digest today | Used by |',
  '| --- | --- | --- | --- | --- |',
  ...results.map((r) =>
    `| ${r.verdict} | \`${r.ref}\` | ${r.status || r.error} | ${r.digest ? `\`${r.digest}\`` : ''} | ${r.leaves.join(', ')} |`),
  '',
].join('\n');

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > -1) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(results, null, 2));

if (count('broken')) {
  console.error(`\n${count('broken')} pinned tag(s) are no longer published.`);
  process.exit(1);
}
