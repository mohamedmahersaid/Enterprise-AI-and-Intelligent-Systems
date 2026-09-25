/**
 * Fetches every external link the curriculum cites and reports what came back.
 *
 * validate-content proves each reference has a URL. It cannot prove the URL
 * still answers, or that it is the page the reference names - that needs the
 * network, which a pull-request check should not depend on. This runs on a
 * schedule instead, and on demand, and records for every URL the status, where
 * it redirected, and the page title, so a reviewer can see that a link resolves
 * to the document it claims to be rather than to a homepage or a login wall.
 *
 * Three outcomes, kept distinct because they mean different things:
 *   broken      404, 410, a DNS failure or a refused connection - the link is
 *               wrong or gone, and the check fails.
 *   unconfirmed 401, 403, 429 or a 5xx - the host refused or failed us. Many
 *               sites block automated clients, so this is reported, not failed:
 *               it says the link could not be confirmed, not that it is bad.
 *   ok          2xx after redirects.
 *
 * Usage: node scripts/check-links.mjs [--json report.json]
 */
import fs from 'node:fs';

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 8;
const RETRIES = 2;
const USER_AGENT = 'Mozilla/5.0 (compatible; curriculum-link-check; +https://github.com/mohamedmahersaid/Enterprise-AI-and-Intelligent-Systems)';

const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));

/** Every https link in the leaves and the certification registry, with where it is used. */
function collect() {
  const found = new Map();
  const add = (url, where) => {
    const clean = url.replace(/[).,;]+$/, '');
    if (!found.has(clean)) found.set(clean, new Set());
    found.get(clean).add(where);
  };
  for (const leaf of catalog.leaves) {
    if (!fs.existsSync(leaf.path)) continue;
    const lines = fs.readFileSync(leaf.path, 'utf8').split('\n');
    let fenced = false;
    for (const [i, line] of lines.entries()) {
      if (line.trimStart().startsWith('```')) fenced = !fenced;
      if (fenced) continue; // command examples point at placeholders, not sources
      for (const m of line.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)) add(m[1], `${leaf.path}:${i + 1}`);
    }
  }
  const registry = JSON.parse(fs.readFileSync('data/certifications.json', 'utf8'));
  for (const c of registry.credentials) add(c.source, `data/certifications.json (${c.id})`);
  for (const r of registry.retired) {
    add(r.source, `data/certifications.json (${r.code})`);
    if (r.successor_source) add(r.successor_source, `data/certifications.json (${r.code} successor)`);
  }
  for (const f of registry.frameworks) add(f.source, `data/certifications.json (${f.id})`);
  return found;
}

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

async function probe(url) {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8' },
      });
      let title = '';
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('html')) {
        const text = (await res.text()).slice(0, 400_000);
        title = decode((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim());
      } else {
        await res.body?.cancel();
        title = type.split(';')[0];
      }
      last = { status: res.status, final: res.url, title };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (error) {
      last = { status: 0, final: url, title: '', error: error.cause?.code ?? error.name };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

function verdict({ status }) {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 404 || status === 410 || status === 0) return 'broken';
  return 'unconfirmed';
}

async function main() {
  const links = [...collect().entries()];
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < links.length) {
        const [url, where] = links[next++];
        const r = await probe(url);
        results.push({ url, where: [...where], ...r, verdict: verdict(r) });
      }
    })
  );
  results.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.url.localeCompare(b.url));

  const count = (v) => results.filter((r) => r.verdict === v).length;
  const md = [
    `## Link check`,
    '',
    `${results.length} links: ${count('ok')} ok, ${count('unconfirmed')} unconfirmed, ${count('broken')} broken.`,
    '',
    '| Verdict | Status | URL | Page title | Used in |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((r) =>
      `| ${r.verdict} | ${r.status || r.error} | ${r.url}${r.final && r.final !== r.url ? ` → ${r.final}` : ''} | ` +
      `${(r.title || '').replace(/\|/g, '\\|').slice(0, 120)} | ${r.where.slice(0, 3).join('<br>')}${r.where.length > 3 ? ' …' : ''} |`
    ),
    '',
  ].join('\n');

  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt > -1) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(results, null, 2));

  if (count('broken')) {
    console.error(`\n${count('broken')} broken link(s).`);
    process.exit(1);
  }
}

await main();
