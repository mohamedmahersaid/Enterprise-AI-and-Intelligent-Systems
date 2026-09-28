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
import { STYLE, SCRIPT, THEME_BOOTSTRAP, SIDEBAR_TOGGLE, mermaidLoader } from './lib/site-assets.mjs';
import { checkSite } from './check-site.mjs';
import { LEVELS, NEEDS, VALIDATION_PATH, latestRuns, loadValidation, needsSentence } from './lib/readiness.mjs';
import { searchEntry, indexSizeProblem } from './lib/search-index.mjs';
import { levelOrdered, stripHeaderBlock, tocOf, LEVEL_ORDER } from './lib/leaf-page.mjs';
import { LEVEL_DEFINITIONS } from './lib/schema.mjs';

const OUT = 'site';

// Mermaid is served from the site itself, copied at build time from the
// pinned devDependency (held on 11.x, see .github/dependabot.yml). The version
// is in the path so a bump can never be served from a stale browser cache.
const MERMAID_DIST = join('node_modules', 'mermaid', 'dist');
const MERMAID_VERSION = JSON.parse(readFileSync(join('node_modules', 'mermaid', 'package.json'), 'utf8')).version;
const MERMAID_DIR = `assets/mermaid-${MERMAID_VERSION}`;
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
  // Only a page with a diagram loads mermaid; scripts/check-site.mjs fails the
  // build if a page with one lacks the loader, or a page without one has it.
  const hasDiagram = body.includes('<pre class="mermaid">');
  const diagramScripts = hasDiagram
    ? `<script type="module">${mermaidLoader(`${base}${MERMAID_DIR}/mermaid.esm.min.mjs`)}</script>\n`
    : '';
  const noscript = hasDiagram
    ? `<noscript><style>pre.mermaid { text-align: left; } pre.mermaid::before { content: "Diagram source (rendering needs JavaScript)"; display: block; font-weight: 600; margin-bottom: 8px; }</style></noscript>\n`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<script>${THEME_BOOTSTRAP}</script>
<style>${STYLE}</style>
${noscript}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="${base}index.html">AI &amp; Intelligent Systems</a>
  <div class="search" role="search">
    <input id="search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="results" aria-keyshortcuts="/" placeholder="Search the curriculum (press /)" aria-label="Search the curriculum" autocomplete="off">
    <div id="results" role="listbox" aria-label="Search results" hidden></div>
    <p id="search-status" class="search-status sr-only" role="status" aria-live="polite"></p>
  </div>
  <span class="spacer"></span>
  <button class="theme" id="theme" type="button">Theme: System</button>
</header>
<div class="wrap">
<nav class="side" aria-label="Curriculum">
<details open>
<summary>Browse the curriculum</summary>
${sidebar(base, current)}
</details>
</nav>
<script>${SIDEBAR_TOGGLE}</script>
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
${diagramScripts}</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// navigation, derived from the catalog

const CURRENT = ' class="current" aria-current="page"';

function buildSidebar(grouped) {
  return (base, current) => {
    // The catalog and the learning paths are the two ways in. They sit above
    // the tree listing because a reader who does not yet know which tree they
    // want is exactly the reader who needs them.
    const top = [
      ['Learning paths', 'PATHS.html'],
      ['Full catalog', 'CATALOG.html'],
      ['Browse by level and readiness', 'browse.html'],
      ['Readiness', 'READINESS.html'],
      ['Validation runs', 'validation.html'],
    ].map(([label, href]) => {
      const active = current === href ? CURRENT : '';
      return `<li><a href="${base}${href}"${active}>${escapeHtml(label)}</a></li>`;
    }).join('');
    const parts = [`<ul class="sidebar-top">${top}</ul>`];
    for (const [tree, branches] of grouped) {
      // Not a heading: the page's own h1 must be the first heading a screen
      // reader meets, and the nav already has its label.
      parts.push(`<p class="tree">${escapeHtml(tree)}</p>`);
      for (const [branch, leaves] of branches) {
        parts.push(`<ul>`);
        const branchIndex = branchIndexOf(leaves);
        parts.push(
          `<li><strong><a href="${base}${branchIndex}"${branchIndex === current ? CURRENT : ''}>${escapeHtml(branch)}</a></strong></li>`
        );
        for (const leaf of leaves) {
          const url = leaf.path.replace(/\.md$/, '.html');
          const cls = url === current ? CURRENT : '';
          // The readiness marker only where it says something: 'validated'
          // is the exception worth surfacing in a list of 35, 'lab' the rule.
          const validated = leaf.readiness === 'validated'
            ? ` <span class="badge rd-validated" title="Run live against the real service by a recorded CI run">Validated</span>`
            : '';
          parts.push(
            `<li><a${cls} href="${base}${url}">${escapeHtml(leaf.name)}</a>` +
            ` <span class="badge lv-${escapeHtml(leaf.level)}">${escapeHtml(leaf.level)}</span>${validated}</li>`
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

// The crumb, and the facts panel that replaces the run-on `**Level:** ...`
// block the markdown carries for GitHub readers (stripHeaderBlock removes
// it): the same facts, stated once, with the run evidence a reader would
// otherwise dig out of data/validation.json.
function leafHeader(leaf, base, run) {
  const treeIndex = dirname(dirname(leaf.path)).split(sep).join('/') + '/index.html';
  const branchIndex = dirname(leaf.path).split(sep).join('/') + '/index.html';
  const facts = [
    ['Level', `<span class="badge lv-${escapeHtml(leaf.level)}">${escapeHtml(leaf.level)}</span>`],
    ['Readiness', readinessBadge(leaf, base) + ` <span class="s">${escapeHtml(LEVELS[leaf.readiness].summary)}</span>`],
    ['A live run needs', escapeHtml(needsSentence(leaf.needs).replace(/^A live run needs /, '').replace(/\.$/, ''))],
  ];
  if (run) {
    const report = `data/live/runs/${run.leaf}-${run.run_id}.json`;
    const reportLink = existsSync(report) ? ` · <a href="${base}${report}">report</a>` : '';
    facts.push(['Latest live run', `${escapeHtml(run.result)} on ${escapeHtml(run.date)} · ` +
      `<a href="${escapeHtml(run.run)}">evidence</a>${reportLink}`]);
  }
  return `<div class="crumb">` +
    `<a href="${base}index.html">Forest</a> / ` +
    `<a href="${base}${treeIndex}">${escapeHtml(leaf.tree)}</a> / ` +
    `<a href="${base}${branchIndex}">${escapeHtml(leaf.branch)}</a>` +
    `</div>\n` +
    `<dl class="facts">\n` +
    facts.map(([term, detail]) => `<div><dt>${escapeHtml(term)}</dt><dd>${detail}</dd></div>`).join('\n') +
    `\n</dl>\n`;
}

// "On this page", from the same headings the renderer gives ids to. Placed
// after the H1 by the caller; leaves have eleven sections, README pages
// mostly two or three, so short pages carry no list.
function onThisPage(markdown) {
  const toc = tocOf(markdown);
  if (toc.length < 3) return '';
  return `<nav class="toc" aria-label="On this page"><p class="toc-label">On this page</p><ul>` +
    toc.map(({ text, id }) => `<li><a href="#${escapeHtml(id)}">${escapeHtml(text)}</a></li>`).join('') +
    `</ul></nav>\n`;
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
// browse and validation pages

// Static preset lists - by level, by readiness, by need - each a plain
// anchor a page can link to; the filter input above them is an enhancement
// the page works without.
function browsePage(catalog, base) {
  const row = (leaf) => {
    const url = leaf.path.replace(/\.md$/, '.html');
    const validated = leaf.readiness === 'validated' ? ` <span class="badge rd-validated">Validated</span>` : '';
    return `<li data-browse><a href="${base}${url}">${escapeHtml(leaf.name)}</a>` +
      ` <span class="badge lv-${escapeHtml(leaf.level)}">${escapeHtml(leaf.level)}</span>${validated}</li>`;
  };
  const section = (id, label, leaves, note) => leaves.length
    ? `<h3 id="${escapeHtml(id)}">${escapeHtml(label)} <span class="s">(${leaves.length})</span></h3>\n` +
      (note ? `<p class="s">${escapeHtml(note)}</p>\n` : '') +
      `<ul>\n${leaves.map(row).join('\n')}\n</ul>`
    : '';
  const byLevel = LEVEL_ORDER.map((level) =>
    section(`level-${slug(level)}`, level, catalog.leaves.filter((l) => l.level === level), LEVEL_DEFINITIONS[level])).filter(Boolean);
  const byReadiness = Object.entries(LEVELS).map(([id, level]) =>
    section(`readiness-${id}`, level.label, catalog.leaves.filter((l) => l.readiness === id))).filter(Boolean);
  const byNeed = Object.entries(NEEDS).map(([id, need]) =>
    section(`need-${id}`, need.label, catalog.leaves.filter((l) => Array.isArray(l.needs) && l.needs.includes(id)))).filter(Boolean);
  return `<h1>Browse the curriculum</h1>
<p>Every leaf, three ways: by level, by <a href="${base}READINESS.html">readiness</a>, and by
what a live run of it needs. The filter narrows all three at once.</p>
<p class="browse-filter"><label for="browse-filter">Filter</label>
<input id="browse-filter" type="search" autocomplete="off" placeholder="e.g. feast, Beginner, Ollama">
<span id="browse-count" role="status" aria-live="polite" class="s"></span></p>
<h2>By level</h2>
${byLevel.join('\n')}
<h2>By readiness</h2>
${byReadiness.join('\n')}
<h2>By what a live run needs</h2>
${byNeed.join('\n')}
`;
}

// Every recorded run, newest first: the history behind the READINESS table's
// "latest" column, with each run's committed report where one exists.
function validationPage(catalog, validation, base) {
  const byId = new Map(catalog.leaves.map((l) => [l.id, l]));
  const runs = [...(validation.runs ?? [])].sort((a, b) =>
    a.date === b.date ? (b.run_id ?? 0) - (a.run_id ?? 0) : a.date < b.date ? 1 : -1);
  const rows = runs.map((run) => {
    const leaf = byId.get(run.leaf);
    const name = leaf
      ? `<a href="${base}${leaf.path.replace(/\.md$/, '.html')}">${escapeHtml(leaf.name)}</a>`
      : escapeHtml(run.leaf);
    const report = `data/live/runs/${run.leaf}-${run.run_id}.json`;
    const evidence = `<a href="${escapeHtml(run.run)}">run</a>` +
      (existsSync(report) ? ` · <a href="${base}${report}">report</a>` : '');
    return `<tr><td>${escapeHtml(run.date)}</td><td>${name}</td>` +
      `<td class="run-${escapeHtml(run.result)}">${escapeHtml(run.result)}</td>` +
      `<td>${escapeHtml(run.event)}</td><td class="s">${escapeHtml(run.covered)}</td><td>${evidence}</td></tr>`;
  });
  return `<h1>Validation runs</h1>
<p>Every live run recorded in <a href="${base}${VALIDATION_PATH}"><code>${VALIDATION_PATH}</code></a>,
newest first. A leaf is <a href="${base}READINESS.html#validated">validated</a> exactly while its
latest run here passed; each run links the CI run itself and the trimmed report committed with it,
so the evidence can be read rather than taken on trust.</p>
<table class="runs">
<thead><tr><th>Date</th><th>Leaf</th><th>Result</th><th>Trigger</th><th>Covered</th><th>Evidence</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
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
  const validation = loadValidation();
  const latest = latestRuns(validation);
  // The pager reads in level order - all of Beginner before Intermediate -
  // rather than tree order, so "next" continues at the reader's level.
  const ordered = levelOrdered([...grouped].flatMap(([, branches]) => [...branches].flatMap(([, leaves]) => leaves)));

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const sources = markdownFiles('.');
  const entries = new Map();
  let written = 0;

  for (const source of sources) {
    const out = outputPathFor(source);
    const depth = out.split('/').length - 1;
    const base = depth === 0 ? './' : '../'.repeat(depth);
    const raw = stripFrontmatter(readFileSync(source, 'utf8'));
    const leaf = byPath.get(relative('.', source).split(sep).join('/'));
    const entry = leaf ? searchEntry(leaf, raw) : null;
    if (leaf) entries.set(leaf.id, entry);

    let body = rewriteLinks(marked.parse(leaf ? stripHeaderBlock(raw) : raw));
    if (leaf) {
      body = body.replace('</h1>', '</h1>\n' + onThisPage(raw));
      body = leafHeader(leaf, base, latest.get(leaf.id)) + body + pager(leaf, ordered, base);
    }

    const firstHeading = raw.match(/^#\s+(.+)$/m);
    const title = leaf ? leaf.name : firstHeading ? firstHeading[1].trim() : out;

    const target = join(OUT, out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, pageShell({
      title: `${title} - ${catalog.name}`,
      // The leaf's own opening sentences, the same text its search result
      // shows; the catalog row is only the fallback for a leaf without an
      // Explanation.
      description: leaf ? entry.description || `${leaf.level} leaf in ${leaf.branch}.` : catalog.description || '',
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

  writeFileSync(join(OUT, 'browse.html'), pageShell({
    title: `Browse - ${catalog.name}`,
    description: 'Every leaf by level, by readiness, and by what a live run of it needs.',
    body: browsePage(catalog, './'),
    sidebar, depth: 0, current: 'browse.html',
  }));

  writeFileSync(join(OUT, 'validation.html'), pageShell({
    title: `Validation runs - ${catalog.name}`,
    description: 'Every recorded live validation run, with its CI run and committed report.',
    body: validationPage(catalog, validation, './'),
    sidebar, depth: 0, current: 'validation.html',
  }));

  // In catalog order, from the entries collected while each leaf's page was
  // rendered; a catalog leaf whose file the walk never met would already have
  // failed validate-content.
  const index = catalog.leaves.map((leaf) => entries.get(leaf.id)).filter(Boolean);
  const indexJson = JSON.stringify(index);
  const oversize = indexSizeProblem(indexJson);
  if (oversize) {
    console.error(oversize);
    return 1;
  }
  writeFileSync(join(OUT, 'search-index.json'), indexJson);

  // Pages would otherwise run the output through Jekyll and drop nothing here,
  // but underscore-prefixed paths are a silent trap; disable it explicitly.
  writeFileSync(join(OUT, '.nojekyll'), '');

  // READINESS.md sends readers to the run records as the evidence behind each
  // level, so the site publishes them; otherwise the link works on GitHub and
  // is a 404 here.
  mkdirSync(join(OUT, 'data'), { recursive: true });
  copyFileSync(VALIDATION_PATH, join(OUT, VALIDATION_PATH));

  // The committed run reports the facts panels and validation.html link to.
  const runsDir = join('data', 'live', 'runs');
  if (existsSync(runsDir)) {
    mkdirSync(join(OUT, runsDir), { recursive: true });
    for (const entry of readdirSync(runsDir)) {
      if (entry.endsWith('.json')) copyFileSync(join(runsDir, entry), join(OUT, runsDir, entry));
    }
  }

  // The mermaid entry module imports its chunks by relative path, so the
  // layout under dist/ is kept. Source maps are left out (about 13 MB); the
  // licence travels with the code. The files stay .mjs: Pages takes its MIME
  // types from mime-db, which maps .mjs to text/javascript, as a module script
  // requires (docs.github.com/en/pages/getting-started-with-github-pages/
  // creating-a-github-pages-site#mime-types-on-github-pages).
  const mermaidOut = join(OUT, MERMAID_DIR);
  const chunks = join('chunks', 'mermaid.esm.min');
  mkdirSync(join(mermaidOut, chunks), { recursive: true });
  copyFileSync(join(MERMAID_DIST, 'mermaid.esm.min.mjs'), join(mermaidOut, 'mermaid.esm.min.mjs'));
  copyFileSync(join('node_modules', 'mermaid', 'LICENSE'), join(mermaidOut, 'LICENSE'));
  for (const entry of readdirSync(join(MERMAID_DIST, chunks))) {
    if (entry.endsWith('.mjs')) copyFileSync(join(MERMAID_DIST, chunks, entry), join(mermaidOut, chunks, entry));
  }

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

  // Structural rules a page must keep: see scripts/check-site.mjs.
  const problems = checkSite(OUT);
  if (problems.length) {
    console.error(`${problems.length} structural problem(s) in the built site:\n${problems.map((p) => '  ' + p).join('\n')}`);
    return 1;
  }

  console.log(`Built ${written} pages and ${copied} fixture files into ${OUT}/ (${index.length} leaves indexed for search); every page passes check-site.`);
  return 0;
}

process.exit(main());
