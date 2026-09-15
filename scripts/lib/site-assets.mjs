// Styles and client script for the generated site. Kept in one module so the
// generator stays readable and the design lives in a single place.

export const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0;
  --accent: #0969da; --accent-soft: #ddf4ff; --card: #f6f8fa; --code: #f6f8fa;
  --beginner: #1a7f37; --intermediate: #0969da; --advanced: #8250df;
  --enterprise: #bc4c00; --expert: #cf222e;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d;
    --accent: #4493f8; --accent-soft: #121d2f; --card: #151b23; --code: #151b23;
    --beginner: #3fb950; --intermediate: #4493f8; --advanced: #ab7df8;
    --enterprise: #db6d28; --expert: #f85149;
  }
}
:root[data-theme="dark"] {
  --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d;
  --accent: #4493f8; --accent-soft: #121d2f; --card: #151b23; --code: #151b23;
  --beginner: #3fb950; --intermediate: #4493f8; --advanced: #ab7df8;
  --enterprise: #db6d28; --expert: #f85149;
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
.skip:focus { left: 8px; top: 8px; background: var(--bg); padding: 8px 12px; border: 2px solid var(--accent); z-index: 100; }
header.top {
  position: sticky; top: 0; z-index: 20; background: var(--bg);
  border-bottom: 1px solid var(--line); padding: 10px 16px;
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
}
header.top .brand { font-weight: 600; color: var(--fg); white-space: nowrap; }
header.top .spacer { flex: 1 1 auto; }
#search {
  flex: 1 1 220px; min-width: 0; max-width: 420px; padding: 7px 11px;
  border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg); color: var(--fg); font: inherit; font-size: 14px;
}
#search:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
button.theme {
  border: 1px solid var(--line); background: var(--bg); color: var(--fg);
  border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 14px;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px; display: flex; gap: 32px; }
nav.side {
  width: 268px; flex: 0 0 268px; padding: 24px 0 48px;
  position: sticky; top: 57px; align-self: flex-start;
  max-height: calc(100vh - 57px); overflow-y: auto; font-size: 14px;
}
nav.side h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 18px 0 6px; }
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
#results { position: absolute; z-index: 30; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; margin-top: 4px; max-height: 62vh; overflow-y: auto; width: min(420px, calc(100vw - 32px)); box-shadow: 0 8px 24px rgba(0,0,0,.18); }
#results:empty { display: none; }
#results a { display: block; padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--fg); font-size: 14px; }
#results a:last-child { border-bottom: 0; }
#results a:hover, #results a:focus { background: var(--accent-soft); text-decoration: none; }
#results .t { display: block; font-weight: 600; }
#results .s { display: block; font-size: 12px; color: var(--muted); }
@media (max-width: 900px) {
  .wrap { flex-direction: column; gap: 0; }
  nav.side { width: auto; flex: none; position: static; max-height: none; padding: 16px 0 0; border-bottom: 1px solid var(--line); }
  main { padding-top: 18px; }
  main h1 { font-size: 25px; }
}
@media print { header.top, nav.side, .pager, #results { display: none; } }
`;

export const SCRIPT = `
(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('theme');
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) { /* private mode: fall back to prefers-color-scheme */ }

  var toggle = document.getElementById('theme');
  if (toggle) toggle.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  var input = document.getElementById('search');
  var box = document.getElementById('results');
  if (!input || !box) return;
  var index = null;

  function load() {
    if (index) return Promise.resolve(index);
    return fetch(BASE + 'search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { index = data; return data; });
  }

  function render(matches) {
    box.innerHTML = '';
    matches.slice(0, 12).forEach(function (item) {
      var a = document.createElement('a');
      a.href = BASE + item.url;
      a.innerHTML = '<span class="t"></span><span class="s"></span>';
      a.firstChild.textContent = item.title;
      a.lastChild.textContent = item.level + ' \\u00b7 ' + item.branch;
      box.appendChild(a);
    });
  }

  var timer;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { box.innerHTML = ''; return; }
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
        render(scored.map(function (s) { return s.item; }));
      }).catch(function () { box.innerHTML = ''; });
    }, 120);
  });

  document.addEventListener('click', function (e) {
    if (e.target !== input && !box.contains(e.target)) box.innerHTML = '';
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { box.innerHTML = ''; input.blur(); }
  });
})();
`;
