// Styles and client script for the generated site. Kept in one module so the
// generator stays readable and the design lives in a single place.

export const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0;
  --accent: #0969da; --accent-soft: #ddf4ff; --card: #f6f8fa; --code: #f6f8fa;
  --beginner: #1a7f37; --intermediate: #0969da; --advanced: #8250df;
  --enterprise: #bc4c00; --expert: #cf222e;
  /* The only visible edge of the search input and theme button, so it must
     reach 3:1 against --bg (WCAG 1.4.11); scripts/check-site.mjs asserts it. */
  --control-border: #818b98;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d;
    --accent: #4493f8; --accent-soft: #121d2f; --card: #151b23; --code: #151b23;
    --beginner: #3fb950; --intermediate: #4493f8; --advanced: #ab7df8;
    --enterprise: #db6d28; --expert: #f85149;
    --control-border: #656c76;
  }
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d;
  --accent: #4493f8; --accent-soft: #121d2f; --card: #151b23; --code: #151b23;
  --beginner: #3fb950; --intermediate: #4493f8; --advanced: #ab7df8;
  --enterprise: #db6d28; --expert: #f85149;
  --control-border: #656c76;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.skip { position: absolute; left: -9999px; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip:focus { left: 8px; top: 8px; background: var(--bg); padding: 8px 12px; border: 2px solid var(--accent); z-index: 100; }
header.top {
  position: sticky; top: 0; z-index: 20; background: var(--bg);
  border-bottom: 1px solid var(--line); padding: 10px 16px;
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
}
header.top .brand { font-weight: 600; color: var(--fg); white-space: nowrap; }
header.top .spacer { flex: 1 1 auto; }
header.top .search { position: relative; flex: 1 1 220px; min-width: 0; max-width: 420px; }
#search {
  width: 100%; padding: 7px 11px;
  border: 1px solid var(--control-border); border-radius: 6px;
  background: var(--bg); color: var(--fg); font: inherit; font-size: 14px;
}
#search:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
button.theme {
  border: 1px solid var(--control-border); background: var(--bg); color: var(--fg);
  border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 14px;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px; display: flex; gap: 32px; }
nav.side {
  width: 268px; flex: 0 0 268px; padding: 24px 0 48px;
  position: sticky; top: 57px; align-self: flex-start;
  max-height: calc(100vh - 57px); overflow-y: auto; font-size: 14px;
}
nav.side summary { display: none; }
nav.side .tree { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 18px 0 6px; }
nav.side ul { list-style: none; margin: 0 0 4px; padding: 0; }
nav.side li { margin: 3px 0; }
nav.side a { color: var(--fg); display: block; padding: 2px 0; }
nav.side a.current { color: var(--accent); font-weight: 600; }
nav.side ul.sidebar-top { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
nav.side ul.sidebar-top a { font-weight: 600; }
main { flex: 1 1 auto; min-width: 0; padding: 24px 0 80px; }
main h1 { font-size: 30px; line-height: 1.25; margin: 0 0 6px; letter-spacing: -.01em; }
main h2 { font-size: 22px; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
main h3 { font-size: 17px; margin: 22px 0 6px; }
main p, main li { overflow-wrap: break-word; }
main img { max-width: 100%; }
code {
  background: var(--code); border: 1px solid var(--line); border-radius: 4px;
  padding: .12em .35em; font-size: 85%;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
pre { background: var(--code); border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; overflow-x: auto; }
pre code { background: none; border: 0; padding: 0; font-size: 13px; }
pre.mermaid { text-align: center; border: 1px solid var(--line); }
blockquote { margin: 16px 0; padding: 8px 14px; border-left: 3px solid var(--accent); background: var(--card); color: var(--muted); }
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 6px 12px; text-align: left; }
th { background: var(--card); }
hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
.badge {
  display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .03em;
  text-transform: uppercase; padding: 2px 8px; border-radius: 999px;
  border: 1px solid currentColor; white-space: nowrap;
}
.lv-Beginner { color: var(--beginner); }
.lv-Intermediate { color: var(--intermediate); }
.lv-Advanced { color: var(--advanced); }
.lv-Enterprise { color: var(--enterprise); }
.lv-Expert { color: var(--expert); }
.rd-lab { color: var(--muted); border-style: dashed; }
.rd-validated { color: var(--beginner); }
.crumb { font-size: 13px; color: var(--muted); margin-bottom: 10px; }
.crumb a { color: var(--muted); }
.meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 22px; font-size: 13px; color: var(--muted); }
.stats { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0 8px; padding: 0; list-style: none; }
.stats li { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 16px; min-width: 92px; }
.stats .n { display: block; font-size: 24px; font-weight: 600; line-height: 1.1; }
.stats .k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(272px, 1fr)); margin: 18px 0; }
.card { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; background: var(--card); }
.card h3 { margin: 0 0 4px; font-size: 16px; }
.card p { margin: 0 0 8px; font-size: 14px; color: var(--muted); }
.card ul { margin: 0; padding-left: 18px; font-size: 14px; }
.card li { margin: 3px 0; }
.pager { display: flex; justify-content: space-between; gap: 16px; margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 14px; }
footer.site { border-top: 1px solid var(--line); padding: 20px 16px 40px; color: var(--muted); font-size: 13px; text-align: center; }
/* Anchored to the .search wrapper, so the panel opens under the input rather
   than over it wherever the header wraps. */
#results, .search-status.shown {
  position: absolute; top: 100%; left: 0; z-index: 30; background: var(--bg);
  border: 1px solid var(--control-border); border-radius: 8px; margin-top: 4px;
  width: min(420px, calc(100vw - 32px)); box-shadow: 0 8px 24px rgba(0,0,0,.18);
}
#results { max-height: 62vh; overflow-y: auto; }
#results[hidden] { display: none; }
/* The status line is visually hidden while it only counts results, and shown
   as the panel when there are none. */
.search-status.shown { height: auto; margin: 4px 0 0; padding: 10px 12px; clip: auto; overflow: visible; white-space: normal; font-size: 14px; }
#results a { display: block; padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--fg); font-size: 14px; }
#results a:last-child { border-bottom: 0; }
#results a:hover, #results a[aria-selected="true"] { background: var(--accent-soft); text-decoration: none; }
#results a[aria-selected="true"] { outline: 2px solid var(--accent); outline-offset: -2px; }
#results .t { display: block; font-weight: 600; }
#results .s { display: block; font-size: 12px; color: var(--muted); }
@media (max-width: 900px) {
  /* On a phone the header scrolls away and the curriculum listing collapses
     behind a summary, so the page's own h1 is the first thing on screen. */
  header.top { position: static; }
  header.top .search { order: 3; flex: 1 1 100%; max-width: none; }
  .wrap { flex-direction: column; gap: 0; }
  nav.side { align-self: stretch; width: auto; flex: none; position: static; max-height: none; padding: 12px 0 0; border-bottom: 1px solid var(--line); }
  nav.side summary { display: list-item; cursor: pointer; font-weight: 600; padding: 4px 0 12px; }
  nav.side details[open] summary { padding-bottom: 4px; }
  nav.side li { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; }
  main { padding-top: 18px; }
  main h1 { font-size: 25px; }
}
@media print { header.top, nav.side, .pager, #results, .search-status { display: none; } }
`;

// Runs in <head>, before the stylesheet, so a reader who chose a theme gets it
// on the first paint instead of a flash of the other one.
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

// Runs straight after the sidebar. The listing is open in the HTML, so it is
// there without JavaScript; on a narrow screen it is closed before the first
// paint so the page content comes first, and reopened if the window widens.
export const SIDEBAR_TOGGLE = `(function(){var d=document.querySelector('nav.side details');if(!d)return;var m=matchMedia('(max-width: 900px)');function s(){if(m.matches)d.removeAttribute('open');else d.setAttribute('open','')}s();m.addEventListener('change',s)})();`;

// Only pages that contain a diagram get this. The import path points at the
// copy of mermaid the build takes from node_modules, so no page depends on a
// third-party origin. Each diagram's source is kept before the first render,
// so a theme change can redraw it in the matching mermaid theme.
export function mermaidLoader(moduleUrl) {
  return `
import mermaid from ${JSON.stringify(moduleUrl)};
const root = document.documentElement;
const scheme = matchMedia('(prefers-color-scheme: dark)');
const blocks = [...document.querySelectorAll('pre.mermaid')];
const sources = blocks.map((block) => block.textContent);
let shown = null;
let queue = Promise.resolve();
function isDark() {
  const chosen = root.getAttribute('data-theme');
  return chosen ? chosen === 'dark' : scheme.matches;
}
async function render() {
  const dark = isDark();
  if (dark === shown) return;
  shown = dark;
  blocks.forEach((block, i) => { block.removeAttribute('data-processed'); block.textContent = sources[i]; });
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
  await mermaid.run({ nodes: blocks });
}
function schedule() { queue = queue.then(render, render); }
schedule();
new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
scheme.addEventListener('change', schedule);
`;
}

export const SCRIPT = `
(function () {
  var root = document.documentElement;
  var scheme = matchMedia('(prefers-color-scheme: dark)');

  // Three states: follow the system, or force light or dark. The first click
  // always changes what is on screen: it picks the opposite of the system.
  var toggle = document.getElementById('theme');
  var mode = root.getAttribute('data-theme') || 'system';
  function showMode() {
    toggle.textContent = 'Theme: ' + mode.charAt(0).toUpperCase() + mode.slice(1);
  }
  if (toggle) {
    showMode();
    toggle.addEventListener('click', function () {
      var os = scheme.matches ? 'dark' : 'light';
      var order = ['system', os === 'dark' ? 'light' : 'dark', os];
      mode = order[(order.indexOf(mode) + 1) % order.length];
      if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', mode);
      try {
        if (mode === 'system') localStorage.removeItem('theme');
        else localStorage.setItem('theme', mode);
      } catch (e) { /* private mode: the choice lasts for this page only */ }
      showMode();
    });
  }

  // The search box follows the ARIA combobox pattern: focus stays in the
  // input, the arrow keys move the active option, Enter opens it.
  var input = document.getElementById('search');
  var box = document.getElementById('results');
  var status = document.getElementById('search-status');
  if (!input || !box || !status) return;
  var index = null;
  var active = -1;

  function load() {
    if (index) return Promise.resolve(index);
    return fetch(BASE + 'search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { index = data; return data; });
  }

  function options() { return box.querySelectorAll('[role="option"]'); }

  function setActive(next) {
    var all = options();
    if (!all.length) return;
    if (active >= 0 && all[active]) all[active].setAttribute('aria-selected', 'false');
    active = (next + all.length) % all.length;
    all[active].setAttribute('aria-selected', 'true');
    all[active].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', all[active].id);
  }

  function close() {
    box.hidden = true;
    box.innerHTML = '';
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    status.className = 'search-status sr-only';
    status.textContent = '';
  }

  function render(matches, q) {
    close();
    if (!matches.length) {
      status.className = 'search-status sr-only shown';
      status.textContent = 'No results for \\u201c' + q + '\\u201d. ';
      var a = document.createElement('a');
      a.href = BASE + 'CATALOG.html';
      a.textContent = 'Browse the full catalog';
      status.appendChild(a);
      return;
    }
    var shown = matches.slice(0, 12);
    shown.forEach(function (item, i) {
      var a = document.createElement('a');
      a.href = BASE + item.url;
      a.id = 'result-' + i;
      a.tabIndex = -1;
      a.setAttribute('role', 'option');
      a.setAttribute('aria-selected', 'false');
      a.innerHTML = '<span class="t"></span><span class="s"></span>';
      a.firstChild.textContent = item.title;
      a.lastChild.textContent = item.level + ' \\u00b7 ' + item.readiness + ' \\u00b7 ' + item.branch;
      box.appendChild(a);
    });
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    status.textContent = matches.length > shown.length
      ? 'Showing ' + shown.length + ' of ' + matches.length + ' results'
      : matches.length + (matches.length === 1 ? ' result' : ' results');
  }

  var timer;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { close(); return; }
      load().then(function (data) {
        var terms = q.split(/\\s+/);
        var scored = [];
        data.forEach(function (item) {
          var hay = item.haystack;
          var score = 0;
          for (var i = 0; i < terms.length; i++) {
            var at = hay.indexOf(terms[i]);
            if (at === -1) return;
            score += item.title.toLowerCase().indexOf(terms[i]) !== -1 ? 10 : 1;
          }
          scored.push({ item: item, score: score });
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        render(scored.map(function (s) { return s.item; }), input.value.trim());
      }).catch(close);
    }, 120);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options().length) return;
      e.preventDefault();
      setActive(active === -1 ? (e.key === 'ArrowDown' ? 0 : -1) : active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      var all = options();
      if (!all.length) return;
      e.preventDefault();
      location.href = all[active >= 0 ? active : 0].href;
    } else if (e.key === 'Escape') {
      close();
    }
  });

  // Keep focus in the input while an option or the catalog link is clicked,
  // so the blur below does not remove it before the click lands.
  box.addEventListener('mousedown', function (e) { e.preventDefault(); });
  status.addEventListener('mousedown', function (e) { e.preventDefault(); });
  // Close only when focus leaves the whole widget: Tab from the input to the
  // "Browse the full catalog" link must not remove the link it lands on.
  function leaving(e) {
    var to = e.relatedTarget;
    if (to !== input && !box.contains(to) && !status.contains(to)) close();
  }
  input.addEventListener('blur', leaving);
  status.addEventListener('focusout', leaving);
  status.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { input.focus(); close(); }
  });
  document.addEventListener('click', function (e) {
    if (e.target !== input && !box.contains(e.target) && !status.contains(e.target)) close();
  });

  // '/' focuses the search from anywhere except a text field.
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    input.focus();
  });
})();
`;
