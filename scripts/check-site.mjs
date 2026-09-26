#!/usr/bin/env node
// Structural rules for the built site.
//
// build-site.mjs runs these after it writes site/, so CI enforces them through
// the build step it already has. They can also be run on their own against an
// existing build:
//
//   node scripts/check-site.mjs [site-dir]
//
// Each rule guards a fix that would otherwise regress silently:
//   - no page loads a script from a CDN (mermaid is served from the site, so
//     an offline or air-gapped reader still gets diagrams);
//   - every page has exactly one h1, it is the first heading on the page, and
//     the sidebar holds no heading at all;
//   - an in-site link to #fragment resolves to an id on the target page;
//   - the sidebar link to the current page carries aria-current="page", and
//     no other sidebar link does;
//   - a page with a mermaid block has the mermaid loader, its import path
//     exists in the site, and a page without a block does not load it;
//   - the control border token reaches 3:1 against the background in every
//     theme (WCAG 1.4.11 non-text contrast), and the search input and theme
//     button draw their border with it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

import { STYLE } from './lib/site-assets.mjs';

// Hosts that serve npm packages or libraries to browsers. Any script from
// another origin is also refused, so this list only sharpens the message.
const CDN_HOSTS = [
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'esm.sh', 'esm.run',
  'cdn.skypack.dev', 'ga.jspm.io', 'code.jquery.com', 'ajax.googleapis.com',
];

const ABSOLUTE = /^([a-z][a-z0-9+.-]*:)?\/\//i;
const IMPORT_SPECIFIER = /\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*|\(\s*)?['"]([^'"]+)['"]/g;
const MERMAID_ENTRY = /(^|\/)mermaid(\.esm)?(\.min)?\.m?js$/;

// Resolve a relative URL found on page `from` (a site-relative posix path) to
// the site-relative path of its target, or null when it leaves the site.
function resolveHref(from, href) {
  if (ABSOLUTE.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const path = href.split('#')[0].split('?')[0];
  if (path === '') return from;
  let target = path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(from), path));
  if (target.startsWith('..')) return null;
  if (target === '.' || target.endsWith('/')) target = posix.join(target, 'index.html');
  return target;
}

function scriptProblems(page, doc) {
  const problems = [];
  const hostOf = (url) => {
    try { return new URL(url, 'https://site.invalid/').host; } catch { return url; }
  };
  const refuse = (url, how) => {
    const host = hostOf(url);
    const kind = CDN_HOSTS.includes(host) ? 'a CDN' : 'another origin';
    problems.push(`${page}: ${how} from ${kind} (${url}); serve it from the site instead.`);
  };
  for (const el of doc.querySelectorAll('script[src]')) {
    const src = el.getAttribute('src');
    if (ABSOLUTE.test(src)) refuse(src, 'loads a script');
  }
  for (const el of doc.querySelectorAll('link[href]')) {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    const scripty = /\bmodulepreload\b/.test(rel) || (/\bpreload\b/.test(rel) && el.getAttribute('as') === 'script');
    if (scripty && ABSOLUTE.test(el.getAttribute('href'))) refuse(el.getAttribute('href'), 'preloads a script');
  }
  for (const el of doc.querySelectorAll('script:not([src])')) {
    const text = el.textContent;
    for (const m of text.matchAll(IMPORT_SPECIFIER)) {
      if (ABSOLUTE.test(m[1])) refuse(m[1], 'imports a module');
    }
    for (const host of CDN_HOSTS) {
      if (text.includes(host) && ![...text.matchAll(IMPORT_SPECIFIER)].some((m) => m[1].includes(host))) {
        problems.push(`${page}: an inline script references ${host}; serve the script from the site instead.`);
      }
    }
  }
  return problems;
}

function mermaidLoaders(doc) {
  const found = [];
  for (const el of doc.querySelectorAll('script[src]')) {
    const src = el.getAttribute('src').split('?')[0];
    if (MERMAID_ENTRY.test(src)) found.push(src);
  }
  for (const el of doc.querySelectorAll('script:not([src])')) {
    for (const m of el.textContent.matchAll(IMPORT_SPECIFIER)) {
      if (MERMAID_ENTRY.test(m[1].split('?')[0])) found.push(m[1]);
    }
  }
  return found;
}

/**
 * Check a set of built pages.
 * @param {Record<string, string>} pages site-relative posix path -> HTML
 * @param {Set<string>} [files] every site-relative path in the build (pages included)
 * @returns {string[]} problems, empty when every rule holds
 */
export function checkPages(pages, files = new Set(Object.keys(pages))) {
  const problems = [];
  const docs = new Map();
  for (const [path, html] of Object.entries(pages)) docs.set(path, new JSDOM(html).window.document);

  const idsOf = new Map();
  for (const [path, doc] of docs) {
    const ids = new Set([...doc.querySelectorAll('[id]')].map((el) => el.id));
    for (const el of doc.querySelectorAll('a[name]')) ids.add(el.getAttribute('name'));
    idsOf.set(path, ids);
  }

  for (const [page, doc] of docs) {
    problems.push(...scriptProblems(page, doc));

    const h1s = doc.querySelectorAll('h1').length;
    if (h1s !== 1) problems.push(`${page}: has ${h1s} h1 elements; a page needs exactly one.`);
    // The sidebar's tree labels once were h2s ahead of the page's h1, so a
    // screen reader's heading list began with the navigation, not the page.
    const sideHeadings = [...doc.querySelectorAll('nav.side :is(h1, h2, h3, h4, h5, h6)')];
    if (sideHeadings.length) {
      problems.push(`${page}: the sidebar has ${sideHeadings.length} heading(s) (<${sideHeadings[0].localName}>${sideHeadings[0].textContent.trim()}); its labels must not be headings.`);
    }
    const first = doc.querySelector('h1, h2, h3, h4, h5, h6');
    if (h1s === 1 && first && first.localName !== 'h1') {
      problems.push(`${page}: the first heading is <${first.localName}>${first.textContent.trim()}, not the page's h1.`);
    }

    for (const a of doc.querySelectorAll('a[href*="#"]')) {
      const href = a.getAttribute('href');
      const raw = href.slice(href.indexOf('#') + 1);
      if (raw === '') continue;
      const target = resolveHref(page, href);
      if (!target || !target.endsWith('.html') || !idsOf.has(target)) continue;
      let fragment;
      try { fragment = decodeURIComponent(raw); } catch { fragment = raw; }
      if (!idsOf.get(target).has(fragment)) {
        problems.push(`${page}: link ${href} points at #${fragment}, which ${target === page ? 'this page' : target} has no id for.`);
      }
    }

    for (const a of doc.querySelectorAll('nav.side a[href]')) {
      const target = resolveHref(page, a.getAttribute('href'));
      const marked = a.getAttribute('aria-current');
      if (target === page && marked !== 'page') {
        problems.push(`${page}: the sidebar link to this page lacks aria-current="page".`);
      } else if (target !== page && marked) {
        problems.push(`${page}: the sidebar link to ${target} has aria-current but is not this page.`);
      }
    }

    const hasBlock = Boolean(doc.querySelector('pre.mermaid'));
    const loaders = mermaidLoaders(doc);
    if (hasBlock && !loaders.length) {
      problems.push(`${page}: has a mermaid block but does not load mermaid, so the diagram stays as source.`);
    } else if (!hasBlock && loaders.length) {
      problems.push(`${page}: loads mermaid but has no mermaid block; load it only where a diagram is.`);
    }
    for (const spec of loaders) {
      const target = resolveHref(page, spec);
      if (target && !files.has(target)) problems.push(`${page}: the mermaid loader imports ${spec}, which the site does not contain.`);
    }
  }
  return problems;
}

// WCAG relative luminance and contrast ratio of two #rrggbb colours.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Every rule block that sets --bg must set --control-border to at least 3:1
 * against it, or that theme's inputs and buttons have no visible edge.
 */
export function checkContrast(style) {
  const problems = [];
  for (const m of style.matchAll(/([^{}]+)\{([^{}]*--bg:[^{}]*)\}/g)) {
    const selector = m[1].trim();
    const bg = m[2].match(/--bg:\s*(#[0-9a-f]{6})/i);
    const border = m[2].match(/--control-border:\s*(#[0-9a-f]{6})/i);
    if (!border) {
      problems.push(`site-assets.mjs: ${selector} sets --bg but not --control-border.`);
      continue;
    }
    const ratio = contrast(bg[1], border[1]);
    if (ratio < 3) {
      problems.push(`site-assets.mjs: ${selector} --control-border ${border[1]} on --bg ${bg[1]} is ${ratio.toFixed(2)}:1; non-text contrast needs 3:1.`);
    }
  }
  return problems;
}

// The controls whose only visible edge is their border. Checking the token's
// contrast is not enough if a control stops using the token.
const BORDERED_CONTROLS = ['#search', 'button.theme'];

/**
 * Each control in BORDERED_CONTROLS has a rule of its own in the stylesheet
 * whose border uses var(--control-border).
 */
export function checkControlBorders(style) {
  const problems = [];
  for (const selector of BORDERED_CONTROLS) {
    const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => m[1].split(',').map((x) => x.trim()).includes(selector));
    const borders = rules.flatMap((m) => [...m[2].matchAll(/(?:^|;|\s)border(?:-color)?\s*:\s*([^;]+)/g)].map((b) => b[1].trim()));
    if (!borders.length) {
      problems.push(`site-assets.mjs: no rule for ${selector} sets its border; it needs 1px solid var(--control-border).`);
    } else if (!borders.every((b) => b.includes('var(--control-border)'))) {
      problems.push(`site-assets.mjs: ${selector} border is "${borders.find((b) => !b.includes('var(--control-border)'))}"; use var(--control-border), which is checked for 3:1.`);
    }
  }
  return problems;
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

export function checkSite(dir) {
  const files = new Set();
  const pages = {};
  for (const full of walk(dir)) {
    const rel = relative(dir, full).split(sep).join('/');
    files.add(rel);
    if (rel.endsWith('.html')) pages[rel] = readFileSync(full, 'utf8');
  }
  return [...checkContrast(STYLE), ...checkControlBorders(STYLE), ...checkPages(pages, files)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || 'site';
  const problems = checkSite(dir);
  if (problems.length) {
    console.error(`${problems.length} structural problem(s) in ${dir}/:\n${problems.map((p) => '  ' + p).join('\n')}`);
    process.exit(1);
  }
  console.log(`Site structure OK: every page in ${dir}/ passes.`);
}
