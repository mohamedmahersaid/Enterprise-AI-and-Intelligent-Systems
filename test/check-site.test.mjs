// Each structural rule in scripts/check-site.mjs, shown to fail on a small
// fixture that breaks it and to pass on one that keeps it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkPages, checkContrast, checkControlBorders, contrast } from '../scripts/check-site.mjs';
import { STYLE } from '../scripts/lib/site-assets.mjs';

const LOADER = 'assets/mermaid-11.17.2/mermaid.esm.min.mjs';

// A minimal page in the shape build-site.mjs writes. `nav` and `head`/`tail`
// let a test change one thing at a time.
function page({ body = '<h1 id="top">Title</h1>', nav = '', tail = '', head = '' } = {}) {
  return `<!doctype html><html lang="en"><head><title>t</title>${head}</head><body>
<nav class="side" aria-label="Curriculum">${nav}</nav>
<main id="main">${body}</main>${tail}</body></html>`;
}

const moduleLoader = (spec) => `<script type="module">import mermaid from '${spec}'; mermaid.run();</script>`;

function problems(pages, files) {
  return checkPages(pages, files ? new Set([...Object.keys(pages), ...files]) : undefined);
}

test('a clean site passes every rule', () => {
  const pages = {
    'index.html': page({ nav: '<a href="a.html">A</a>' }),
    'a.html': page({
      body: '<h1>A</h1><h2 id="lab">Lab</h2><pre class="mermaid">flowchart LR\nA-->B</pre><a href="#lab">lab</a><a href="index.html#top">top</a>',
      nav: '<a href="a.html" class="current" aria-current="page">A</a>',
      tail: moduleLoader(LOADER),
    }),
  };
  assert.deepEqual(problems(pages, [LOADER]), []);
});

test('scripts from a CDN are refused, local ones pass', () => {
  const cdnImport = page({ tail: `<script type="module">import m from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';</script>` });
  const cdnSrc = page({ tail: '<script src="https://unpkg.com/lib@1/lib.js"></script>' });
  const otherOrigin = page({ tail: '<script src="//example.com/x.js"></script>' });
  const preload = page({ head: '<link rel="modulepreload" href="https://esm.sh/x">' });
  const dynamic = page({ tail: `<script>import("https://cdn.jsdelivr.net/npm/x/+esm")</script>` });
  const local = page({ tail: '<script src="assets/site.js"></script><script>var BASE = "./";</script>' });

  assert.match(problems({ 'p.html': cdnImport }).join('\n'), /imports a module from a CDN \(https:\/\/cdn\.jsdelivr\.net/);
  assert.match(problems({ 'p.html': cdnSrc }).join('\n'), /loads a script from a CDN \(https:\/\/unpkg\.com/);
  assert.match(problems({ 'p.html': otherOrigin }).join('\n'), /loads a script from another origin/);
  assert.match(problems({ 'p.html': preload }).join('\n'), /preloads a script from a CDN/);
  assert.match(problems({ 'p.html': dynamic }).join('\n'), /imports a module from a CDN/);
  assert.deepEqual(problems({ 'p.html': local }), []);
});

test('a CDN host named only in prose is not a script reference', () => {
  const prose = page({ body: '<h1>T</h1><p>Mirror cdn.jsdelivr.net inside the network.</p>' });
  assert.deepEqual(problems({ 'p.html': prose }), []);
});

test('a page needs exactly one h1', () => {
  assert.match(problems({ 'p.html': page({ body: '<h2>No title</h2>' }) }).join('\n'), /has 0 h1 elements/);
  assert.match(problems({ 'p.html': page({ body: '<h1>A</h1><h1>B</h1>' }) }).join('\n'), /has 2 h1 elements/);
  assert.match(
    problems({ 'p.html': page({ nav: '<h1>Curriculum</h1>' }) }).join('\n'),
    /has 2 h1 elements/,
    'a heading in the sidebar counts too'
  );
  assert.deepEqual(problems({ 'p.html': page() }), []);
});

test('the sidebar holds no heading and the page h1 comes first', () => {
  // The markup the sidebar had before its tree labels stopped being headings.
  const old = problems({ 'p.html': page({ nav: '<h2>Tree</h2><ul><li><a href="x.html">X</a></li></ul>' }) }).join('\n');
  assert.match(old, /the sidebar has 1 heading\(s\) \(<h2>Tree\); its labels must not be headings/);
  assert.match(old, /the first heading is <h2>Tree, not the page's h1/);
  assert.match(
    problems({ 'p.html': page({ body: '<h2>Intro</h2><h1>Title</h1>' }) }).join('\n'),
    /the first heading is <h2>Intro, not the page's h1/
  );
  assert.deepEqual(problems({ 'p.html': page({ nav: '<p class="tree">Tree</p><ul><li><a href="x.html">X</a></li></ul>' }) }), []);
});

test('a #fragment link must resolve to an id on the target page', () => {
  const pages = {
    'docs/a.html': page({ body: '<h1 id="a">A</h1><h2 id="lab">Lab</h2>' }),
    'docs/b.html': page({
      body: '<h1>B</h1><a href="a.html#lab">ok</a><a href="a.html#missing">bad</a>' +
        '<a href="#nowhere">bad here</a><a href="../index.html#x">x</a><a href="#">top</a>' +
        '<a href="https://example.com/#anything">external</a><a href="../data/v.json#k">not a page</a>',
    }),
    'index.html': page({ body: '<h1 id="x">Home</h1>' }),
  };
  const found = problems(pages).join('\n');
  assert.match(found, /docs\/b\.html: link a\.html#missing points at #missing, which docs\/a\.html has no id for/);
  assert.match(found, /docs\/b\.html: link #nowhere points at #nowhere, which this page has no id for/);
  assert.equal(problems(pages).length, 2, found);
});

test('a percent-encoded fragment is decoded before it is looked up', () => {
  const pages = { 'p.html': page({ body: '<h1>T</h1><h2 id="café">C</h2><a href="#caf%C3%A9">c</a>' }) };
  assert.deepEqual(problems(pages), []);
});

test('the sidebar link to the current page needs aria-current="page"', () => {
  const nav = (attrs) => `<a href="a.html"${attrs}>A</a><a href="../index.html">Home</a>`;
  assert.match(
    problems({ 'docs/a.html': page({ nav: nav(' class="current"') }), 'index.html': page() }).join('\n'),
    /docs\/a\.html: the sidebar link to this page lacks aria-current="page"/
  );
  assert.match(
    problems({ 'index.html': page({ nav: '<a href="docs/a.html" aria-current="page">A</a>' }), 'docs/a.html': page() }).join('\n'),
    /index\.html: the sidebar link to docs\/a\.html has aria-current but is not this page/
  );
  // Relative hrefs from a nested page resolve to the same site path.
  const nested = page({ nav: '<a href="../docs/a.html" aria-current="page">A</a><a href="../index.html">H</a>' });
  assert.deepEqual(problems({ 'docs/a.html': nested, 'index.html': page() }), []);
});

test('mermaid loads exactly where a diagram is', () => {
  const diagram = '<h1>T</h1><pre class="mermaid">flowchart LR\nA-->B</pre>';
  assert.match(problems({ 'p.html': page({ body: diagram }) }, [LOADER]).join('\n'), /has a mermaid block but does not load mermaid/);
  assert.match(problems({ 'p.html': page({ tail: moduleLoader(LOADER) }) }, [LOADER]).join('\n'), /loads mermaid but has no mermaid block/);
  assert.match(
    problems({ 'p.html': page({ tail: `<script src="${LOADER.replace('.esm.min.mjs', '.min.js')}"></script>` }) }, [LOADER]).join('\n'),
    /loads mermaid but has no mermaid block/,
    'a classic script tag counts as a loader too'
  );
  assert.deepEqual(problems({ 'p.html': page({ body: diagram, tail: moduleLoader(LOADER) }) }, [LOADER]), []);
});

test('the mermaid loader must point at a file the site contains', () => {
  const diagram = '<h1>T</h1><pre class="mermaid">flowchart LR\nA-->B</pre>';
  const nested = { 'docs/p.html': page({ body: diagram, tail: moduleLoader(`../${LOADER}`) }) };
  assert.deepEqual(problems(nested, [LOADER]), []);
  assert.match(problems(nested, []).join('\n'), /imports \.\.\/assets\/mermaid-11\.17\.2\/mermaid\.esm\.min\.mjs, which the site does not contain/);
});

test('control borders need 3:1 against the background in every theme', () => {
  assert.equal(contrast('#ffffff', '#000000').toFixed(0), '21');
  const good = ':root { --bg: #ffffff; --control-border: #818b98; }\n:root[data-theme="dark"] { --bg: #0d1117; --control-border: #656c76; }';
  assert.deepEqual(checkContrast(good), []);
  const faint = ':root { --bg: #ffffff; --control-border: #d1d9e0; }';
  assert.match(checkContrast(faint).join('\n'), /#d1d9e0 on --bg #ffffff is 1\.43:1/);
  const missing = ':root[data-theme="dark"] { --bg: #0d1117; }';
  assert.match(checkContrast(missing).join('\n'), /sets --bg but not --control-border/);
});

test('the search input and theme button draw their border with the checked token', () => {
  assert.deepEqual(checkControlBorders(STYLE), []);
  const good = '#search { width: 100%; border: 1px solid var(--control-border); border-radius: 6px; }\nbutton.theme { border: 1px solid var(--control-border); }\n' +
    '#browse-filter { border: 1px solid var(--control-border); }\npre .copy { border: 1px solid var(--control-border); }';
  assert.deepEqual(checkControlBorders(good), []);
  // --line is 1.43:1 on the light background, so a control drawn with it has no visible edge.
  const reverted = good.replace('button.theme { border: 1px solid var(--control-border); }', 'button.theme { border: 1px solid var(--line); }');
  assert.match(checkControlBorders(reverted).join('\n'), /button\.theme border is "1px solid var\(--line\)"/);
  const colour = good + '\n#search { border-color: var(--line); }';
  assert.match(checkControlBorders(colour).join('\n'), /#search border is "var\(--line\)"/);
  const none = good.replace(/^#search \{[^}]*\}/, '#search:focus { border: 1px solid var(--control-border); }');
  assert.match(checkControlBorders(none).join('\n'), /no rule for #search sets its border/);
});
