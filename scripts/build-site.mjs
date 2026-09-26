#!/usr/bin/env node
// Build a static site from the curriculum.
//
// Every page is derived: navigation, breadcrumbs, level and readiness badges and the search
// index all come from data/catalog.json, and page bodies come from the markdown
// files it points at. Nothing about the site is maintained by hand, so it cannot
// drift from the catalog the way a second copy of the taxonomy would.
//
// Output goes to site/ and is not committed - CI builds it and GitHub Pages
// serves it.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { marked } from 'marked';

import { readCatalog, group, slug } from './lib/derive.mjs';
import { STYLE, SCRIPT } from './lib/site-assets.mjs';
import { LEVELS, VALIDATION_PATH, needsSentence } from './lib/readiness.mjs';

const OUT = 'site';
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', '.venv', OUT]);

// ---------------------------------------------------------------------------
// markdown

const renderer = new marked.Renderer();

// Mermaid blocks must reach the browser as <pre class="mermaid">, not as a
// highlighted code block, or the client-side renderer never sees them.
// marked emits no heading ids of its own, so an in-page link that works on
// GitHub would be dead here. Using the same slug function as the markdown
// generators keeps a single definition of what a heading anchor is.
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const id = slug(this.parser.parseInline(tokens, this.parser.textRenderer));
  return `<h${depth} id="${escapeHtml(id)}">${text}</h${depth}>\n`;
};

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
    // The catalog and the learning paths are the two ways in. They sit above
    // the tree listing because a reader who does not yet know which tree they
    // want is exactly the reader who needs them.
    const top = [
      ['Learning paths', 'PATHS.html'],
      ['Full catalog', 'CATALOG.html'],
      ['Readiness', 'READINESS.html'],
    ].map(([label, href]) => {
      const active = current === href ? ' class="current"' : '';
      return `<li><a href="${base}${href}"${active}>${escapeHtml(label)}</a></li>`;
    }).join('');
    const parts = [`<ul class="sidebar-top">${top}</ul>`];
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

// A leaf's lab data lives in a fixtures/ directory next to it. The markdown in
// there becomes pages like any other; everything else is published as-is, so
// a reader following the lab from the site can download the files the fixtures
// README links to.
function fixtureDataFiles(dir, found = [], inFixtures = false) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) fixtureDataFiles(full, found, inFixtures || entry === 'fixtures');
    else if (inFixtures && !entry.endsWith('.md')) found.push(full);
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
    `<div class="meta"><span class="badge lv-${escapeHtml(leaf.level)}">${escapeHtml(leaf.level)}</span>` +
    readinessBadge(leaf, base) + `</div>\n`;
}

// The badge links to the page that says what the level does and does not
// prove; its tooltip says what a live run of this leaf would need.
function readinessBadge(leaf, base) {
  const level = LEVELS[leaf.readiness];
  const tip = leaf.readiness === 'lab' ? `${level.summary}. ${needsSentence(leaf.needs)}` : level.summary;
  return ` <a class="badge rd-${escapeHtml(leaf.readiness)}" href="${base}READINESS.html#${escapeHtml(leaf.readiness)}"` +
    ` title="${escapeHtml(tip)}">${escapeHtml(level.label)}</a>`;
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
    ['Validated live', catalog.leaves.filter((l) => l.readiness === 'validated').length],
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
references. Commands and labs are written for an isolated environment. Each leaf's
<a href="${base}READINESS.html">readiness</a> says whether its commands have been run
against the live service or only checked offline, and what a live run would need.</p>
`;
}

// ---------------------------------------------------------------------------
// output check

function deadLinks(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      deadLinks(full, found);
      continue;
    }
    if (!entry.endsWith('.html')) continue;
    for (const m of readFileSync(full, 'utf8').matchAll(/\bhref="([^"#?]*)/g)) {
      const target = m[1];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
      if (!existsSync(normalize(join(dirname(full), target)))) found.push(`  ${full} -> ${target}`);
    }
  }
  return found;
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
    readiness: LEVELS[leaf.readiness].label,
    branch: leaf.branch,
    url: leaf.path.replace(/\.md$/, '.html'),
    haystack: [leaf.name, leaf.level, LEVELS[leaf.readiness].label, leaf.tree, leaf.branch, leaf.id].join(' ').toLowerCase(),
  }));
  writeFileSync(join(OUT, 'search-index.json'), JSON.stringify(index));

  // Pages would otherwise run the output through Jekyll and drop nothing here,
  // but underscore-prefixed paths are a silent trap; disable it explicitly.
  writeFileSync(join(OUT, '.nojekyll'), '');

  // READINESS.md sends readers to the run records as the evidence behind each
  // level, so the site publishes them; otherwise the link works on GitHub and
  // is a 404 here.
  mkdirSync(join(OUT, 'data'), { recursive: true });
  copyFileSync(VALIDATION_PATH, join(OUT, VALIDATION_PATH));

  let copied = 0;
  for (const source of fixtureDataFiles('docs')) {
    const target = join(OUT, relative('.', source));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied += 1;
  }

  // validate-content resolves relative links in the markdown, but a page can
  // still link to a file the site never publishes. Fail the build rather
  // than ship a dead link.
  const dead = deadLinks(OUT);
  if (dead.length) {
    console.error(`${dead.length} relative link(s) in the built site do not resolve:\n${dead.join('\n')}`);
    return 1;
  }

  console.log(`Built ${written} pages and ${copied} fixture files into ${OUT}/ (${index.length} leaves indexed for search).`);
  return 0;
}

process.exit(main());
