#!/usr/bin/env node
// Build a static site from the curriculum.
//
// Every page is derived: navigation, breadcrumbs, level badges and the search
// index all come from data/catalog.json, and page bodies come from the markdown
// files it points at. Nothing about the site is maintained by hand, so it cannot
// drift from the catalog the way a second copy of the taxonomy would.
//
// Output goes to site/ and is not committed - CI builds it and GitHub Pages
// serves it.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { marked } from 'marked';

import { readCatalog, group } from './lib/derive.mjs';
import { STYLE, SCRIPT } from './lib/site-assets.mjs';

const OUT = 'site';
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', OUT]);

// ---------------------------------------------------------------------------
// markdown

const renderer = new marked.Renderer();

// Mermaid blocks must reach the browser as <pre class="mermaid">, not as a
// highlighted code block, or the client-side renderer never sees them.
renderer.code = function ({ text, lang }) {
  if (lang === 'mermaid') return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
  return `<pre><code${cls}>${escapeHtml(text)}</code></pre>\n`;
};

marked.setOptions({ renderer, gfm: true, breaks: false });

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripFrontmatter(source) {
  if (!source.startsWith('---\n')) return source;
  const end = source.indexOf('\n---\n', 4);
  return end === -1 ? source : source.slice(end + 5);
}

// A link to another markdown file has to point at the page we generated from
// it. README.md becomes index.html so directory URLs keep working.
function rewriteLinks(html) {
  return html.replace(/(href=")([^"]+)(")/g, (whole, open, href, close) => {
    if (/^(https?:|mailto:|#|\/)/i.test(href)) return whole;
    const [path, hash = ''] = href.split('#');
    if (!path.endsWith('.md')) return whole;
    let target = path.replace(/\.md$/, '.html');
    target = target.replace(/(^|\/)README\.html$/, '$1index.html');
    return open + target + (hash ? '#' + hash : '') + close;
  });
}

// ---------------------------------------------------------------------------
// page shell

function pageShell({ title, description, body, sidebar, depth, current }) {
  const base = depth === 0 ? './' : '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="${base}index.html">AI &amp; Intelligent Systems</a>
  <input id="search" type="search" placeholder="Search the curriculum" aria-label="Search the curriculum" autocomplete="off">
  <div id="results" role="listbox" aria-label="Search results"></div>
  <span class="spacer"></span>
  <button class="theme" id="theme" type="button" aria-label="Toggle colour theme">Theme</button>
</header>
<div class="wrap">
<nav class="side" aria-label="Curriculum">
${sidebar(base, current)}
</nav>
<main id="main">
${body}
</main>
</div>
<footer class="site">
  Built from <code>data/catalog.json</code>. Validate commands, versions, permissions and rollback
  procedures in an isolated lab before production use.
</footer>
<script>var BASE = ${JSON.stringify(base)};</script>
<script>${SCRIPT}</script>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs';
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') &&
     matchMedia('(prefers-color-scheme: dark)').matches);
  mermaid.initialize({ startOnLoad: true, theme: dark ? 'dark' : 'default' });
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// navigation, derived from the catalog

function buildSidebar(grouped) {
  return (base, current) => {
    const parts = [];
    for (const [tree, branches] of grouped) {
      parts.push(`<h2>${escapeHtml(tree)}</h2>`);
      for (const [branch, leaves] of branches) {
        parts.push(`<ul>`);
        parts.push(
          `<li><strong><a href="${base}${branchIndexOf(leaves)}">${escapeHtml(branch)}</a></strong></li>`
        );
        for (const leaf of leaves) {
          const url = leaf.path.replace(/\.md$/, '.html');
          const cls = url === current ? ' class="current"' : '';
          parts.push(
            `<li><a${cls} href="${base}${url}">${escapeHtml(leaf.name)}</a>` +
            ` <span class="badge lv-${escapeHtml(leaf.level)}">${escapeHtml(leaf.level)}</span></li>`
          );
        }
        parts.push(`</ul>`);
      }
    }
    return parts.join('\n');
  };
}

function branchIndexOf(leaves) {
  return dirname(leaves[0].path).split(sep).join('/') + '/index.html';
}

function treeDirOf(branches) {
  const first = [...branches.values()][0];
  return dirname(dirname(first[0].path)).split(sep).join('/');
}

// ---------------------------------------------------------------------------
// walking the markdown sources

function markdownFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) markdownFiles(full, found);
    else if (entry.endsWith('.md')) found.push(full);
  }
  return found;
}

function outputPathFor(source) {
  const rel = relative('.', source).split(sep).join('/');
  const html = rel.replace(/\.md$/, '.html');
  return html.replace(/(^|\/)README\.html$/, '$1index.html');
}

// ---------------------------------------------------------------------------
// leaf extras: breadcrumb, badge, prev/next

function leafHeader(leaf, base) {
  const treeIndex = dirname(dirname(leaf.path)).split(sep).join('/') + '/index.html';
  const branchIndex = dirname(leaf.path).split(sep).join('/') + '/index.html';
  return `<div class="crumb">` +
    `<a href="${base}index.html">Forest</a> / ` +
    `<a href="${base}${treeIndex}">${escapeHtml(leaf.tree)}</a> / ` +
    `<a href="${base}${branchIndex}">${escapeHtml(leaf.branch)}</a>` +
    `</div>\n` +
    `<div class="meta"><span class="badge lv-${escapeHtml(leaf.level)}">${escapeHtml(leaf.level)}</span></div>\n`;
}

function pager(leaf, ordered, base) {
  const at = ordered.findIndex((l) => l.id === leaf.id);
  const previous = at > 0 ? ordered[at - 1] : null;
  const next = at < ordered.length - 1 ? ordered[at + 1] : null;
  const left = previous
    ? `<a href="${base}${previous.path.replace(/\.md$/, '.html')}">&larr; ${escapeHtml(previous.name)}</a>`
    : '<span></span>';
  const right = next
    ? `<a href="${base}${next.path.replace(/\.md$/, '.html')}">${escapeHtml(next.name)} &rarr;</a>`
    : '<span></span>';
  return `<div class="pager">${left}${right}</div>`;
}

// ---------------------------------------------------------------------------
// landing page

function landing(catalog, grouped, base) {
  const levels = Object.entries(catalog.levelCounts || {}).sort();
  const stats = [
    ['Leaves', catalog.leaves.length],
    ['Trees', catalog.treeCount],
    ['Branches', catalog.branchCount],
    ...levels,
  ];
  const cards = [...grouped].map(([tree, branches]) => {
    const treeIndex = treeDirOf(branches) + '/index.html';
    const rows = [...branches].map(([branch, leaves]) =>
      `<li><a href="${base}${branchIndexOf(leaves)}">${escapeHtml(branch)}</a> ` +
      `<span class="s">(${leaves.length})</span></li>`).join('\n');
    return `<div class="card">
  <h3><a href="${base}${treeIndex}">${escapeHtml(tree)}</a></h3>
  <ul>${rows}</ul>
</div>`;
  }).join('\n');

  const entry = catalog.leaves
    .filter((l) => l.level === 'Beginner')
    .map((l) => `<li><a href="${base}${l.path.replace(/\.md$/, '.html')}">${escapeHtml(l.name)}</a></li>`)
    .join('\n');

  return `<h1>${escapeHtml(catalog.name)}</h1>
<p>${escapeHtml(catalog.description || '')}</p>
<ul class="stats">
${stats.map(([k, n]) => `  <li><span class="n">${n}</span><span class="k">${escapeHtml(k)}</span></li>`).join('\n')}
</ul>
<h2>Start here</h2>
<p>Every tree has an entry point that assumes no prior AI platform experience.</p>
<ul>
${entry}
</ul>
<h2>Trees</h2>
<div class="grid">
${cards}
</div>
<h2>Using this material</h2>
<p>Each leaf carries an explanation, an architecture diagram, commands, an automation
script, a lab with evidence-based validation criteria, operational practices,
troubleshooting scenarios, interview questions, certification alignment and primary-source
references. Commands and labs are written for an isolated environment and must be
validated against current vendor documentation before production use.</p>
`;
}

// ---------------------------------------------------------------------------

function main() {
  const catalog = readCatalog();
  const grouped = group(catalog);
  const sidebar = buildSidebar(grouped);
  const byPath = new Map(catalog.leaves.map((l) => [l.path.split(sep).join('/'), l]));
  const ordered = [...grouped].flatMap(([, branches]) => [...branches].flatMap(([, leaves]) => leaves));

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const sources = markdownFiles('.');
  let written = 0;

  for (const source of sources) {
    const out = outputPathFor(source);
    const depth = out.split('/').length - 1;
    const base = depth === 0 ? './' : '../'.repeat(depth);
    const raw = stripFrontmatter(readFileSync(source, 'utf8'));
    const leaf = byPath.get(relative('.', source).split(sep).join('/'));

    let body = rewriteLinks(marked.parse(raw));
    if (leaf) body = leafHeader(leaf, base) + body + pager(leaf, ordered, base);

    const firstHeading = raw.match(/^#\s+(.+)$/m);
    const title = leaf ? leaf.name : firstHeading ? firstHeading[1].trim() : out;

    const target = join(OUT, out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, pageShell({
      title: `${title} - ${catalog.name}`,
      description: leaf ? `${leaf.level} leaf in ${leaf.branch}.` : catalog.description || '',
      body, sidebar, depth, current: out,
    }));
    written += 1;
  }

  // The landing page replaces the root README rendering: the README is written
  // for someone reading the repository, the landing page for someone browsing.
  writeFileSync(join(OUT, 'index.html'), pageShell({
    title: catalog.name,
    description: catalog.description || '',
    body: landing(catalog, grouped, './'),
    sidebar, depth: 0, current: 'index.html',
  }));

  const index = catalog.leaves.map((leaf) => ({
    title: leaf.name,
    level: leaf.level,
    branch: leaf.branch,
    url: leaf.path.replace(/\.md$/, '.html'),
    haystack: [leaf.name, leaf.level, leaf.tree, leaf.branch, leaf.id].join(' ').toLowerCase(),
  }));
  writeFileSync(join(OUT, 'search-index.json'), JSON.stringify(index));

  // Pages would otherwise run the output through Jekyll and drop nothing here,
  // but underscore-prefixed paths are a silent trap; disable it explicitly.
  writeFileSync(join(OUT, '.nojekyll'), '');

  console.log(`Built ${written} pages into ${OUT}/ (${index.length} leaves indexed for search).`);
  return 0;
}

process.exit(main());
