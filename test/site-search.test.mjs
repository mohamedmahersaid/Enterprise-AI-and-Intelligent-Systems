// The search widget in scripts/lib/site-assets.mjs, run in jsdom against the
// header markup build-site.mjs writes. jsdom has no Tab key, so moving focus
// is done with focus(), which fires the same blur and focusout events with
// the same relatedTarget a Tab does in a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { SCRIPT } from '../scripts/lib/site-assets.mjs';

const HEADER = `<header class="top"><a class="brand" href="index.html">Home</a>
<div class="search" role="search">
  <input id="search" type="search" role="combobox" aria-expanded="false" aria-controls="results">
  <div id="results" role="listbox" hidden></div>
  <p id="search-status" class="search-status sr-only" role="status" aria-live="polite"></p>
</div>
<button class="theme" id="theme" type="button">Theme: System</button></header>`;

const INDEX = [{ url: 'docs/a.html', title: 'Local inference', level: 'Beginner', readiness: 'Draft', branch: 'b', haystack: 'local inference' }];

async function noResults() {
  const dom = new JSDOM(`<!doctype html><body>${HEADER}</body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.fetch = async () => ({ json: async () => INDEX });
  window.BASE = './';
  window.eval(SCRIPT);
  const doc = window.document;
  const input = doc.getElementById('search');
  input.focus();
  input.value = 'zzzqqq';
  input.dispatchEvent(new window.Event('input'));
  await new Promise((r) => setTimeout(r, 200));
  return { window, doc, input, status: doc.getElementById('search-status') };
}

test('with no results, focus can move from the input to the catalog link', async () => {
  const { doc, input, status } = await noResults();
  const link = status.querySelector('a');
  assert.ok(link, 'the no-results panel offers a catalog link');
  assert.equal(link.getAttribute('href'), './CATALOG.html');
  link.focus();
  assert.equal(doc.activeElement, link, 'focus is on the link, not dropped to <body>');
  assert.ok(link.isConnected && status.classList.contains('shown'), 'the panel stays open');
  input.focus();
  assert.ok(status.querySelector('a'), 'moving back to the input keeps the panel');
});

test('focus leaving the widget closes the panel, and Escape on the link returns to the input', async () => {
  let { doc, status } = await noResults();
  status.querySelector('a').focus();
  doc.getElementById('theme').focus();
  assert.equal(status.textContent, '');
  assert.ok(!status.classList.contains('shown'));

  ({ doc, status } = await noResults());
  const link = status.querySelector('a');
  link.focus();
  link.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(doc.activeElement.id, 'search');
  assert.equal(status.textContent, '');
});
