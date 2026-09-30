#!/usr/bin/env node
// Weekly, read-only drift check for the pins nothing else watches.
//
// model-tags.yml checks that pinned Ollama tags still exist; the offline
// gates check that pins are recorded, not that they are current. This script
// covers the rest, from two kinds of source:
//
//   - data/currency.json: hand-reviewed facts - hosted-model retirement
//     dates, service api-versions and npx pins - each with a source and a
//     review deadline. A retirement inside the warning window, or a review
//     deadline that has passed, FAILS the run: both mean the docs will go
//     stale on a known date unless someone acts.
//   - package.json and scripts/requirements*.in/.txt: package pins, checked
//     against the npm and PyPI JSON APIs. A major version behind is
//     ANNOTATED, never a failure - some holds (mermaid on 11.x) are
//     deliberate, and a weekly red for a decision already made teaches
//     people to ignore the workflow.
//
// It reports and exits; it never writes. The workflow that runs it holds
// contents: read and no secrets.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CURRENCY_PATH = 'data/currency.json';

/** Fail when a model retires within this many days. */
export const RETIREMENT_WINDOW_DAYS = 120;

/** Annotate a review_by this close, before failing on the day itself. */
export const REVIEW_WARNING_DAYS = 30;

export const daysUntil = (date, today) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

export const majorOf = (version) => Number(String(version).match(/^v?(\d+)/)?.[1] ?? NaN);

/**
 * name -> pinned version from a requirements file: `name==1.2.3` lines,
 * ignoring comments, hash continuation lines and markers.
 */
export function parseRequirementPins(text) {
  const pins = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([0-9][^\s;]*)/);
    if (m) pins.set(m[1].toLowerCase().replace(/[._]/g, '-'), m[2]);
  }
  return pins;
}

/**
 * The direct dependency names a requirements .in file declares, pinned or
 * bare (`feast`, `rank_bm25==0.2.2`), normalised the way PyPI compares them.
 * `-r other.in` lines are returned separately so the caller can follow them.
 */
export function parseDirectNames(text) {
  const names = new Set();
  const includes = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const include = line.match(/^-r\s+(\S+)/);
    if (include) {
      includes.push(include[1]);
      continue;
    }
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (m) names.add(m[1].toLowerCase().replace(/[._]/g, '-'));
  }
  return { names, includes };
}

/** Exactly-pinned entries of package.json dependency blocks. */
export function packageJsonPins(pkg) {
  const pins = new Map();
  for (const block of [pkg.dependencies, pkg.devDependencies]) {
    for (const [name, version] of Object.entries(block ?? {})) {
      if (/^\d/.test(version)) pins.set(name, version);
    }
  }
  return pins;
}

/**
 * Pure verdicts over gathered facts, so test/ can exercise every rule
 * offline. `latest` maps "npm:<name>" / "pypi:<name>" to the registry's
 * current version, or null where the query failed.
 */
export function assess({ currency, npmPins = new Map(), pypiPins = new Map(), latest = new Map() }, today) {
  const errors = [];
  const warnings = [];

  for (const model of currency.models ?? []) {
    const days = daysUntil(model.retires, today);
    if (days <= RETIREMENT_WINDOW_DAYS) {
      errors.push(
        `model ${model.name} (${model.version}) ${days < 0 ? `retired ${-days} days ago` : `retires in ${days} days`} ` +
          `(${model.retires}); update the leaves that pin it and this entry (source: ${model.source}).`
      );
    }
  }

  for (const kind of ['api_versions', 'npx']) {
    for (const entry of currency[kind] ?? []) {
      const name = entry.service ?? entry.package;
      const days = daysUntil(entry.review_by, today);
      if (days < 0) {
        errors.push(
          `${name} pin ${entry.version} passed its review date ${entry.review_by}; ` +
            `re-read ${entry.source} and move review_by forward, or change the pin.`
        );
      } else if (days <= REVIEW_WARNING_DAYS) {
        warnings.push(`${name} pin ${entry.version} is due for review by ${entry.review_by} (${days} days).`);
      }
    }
  }

  const behind = (registry, name, pinned) => {
    const current = latest.get(`${registry}:${name}`);
    if (current === null) {
      warnings.push(`${registry}: could not fetch the current version of ${name}; pin ${pinned} not checked.`);
      return;
    }
    if (current === undefined) return;
    if (Number.isFinite(majorOf(current)) && majorOf(current) > majorOf(pinned)) {
      warnings.push(`${registry}: ${name} is pinned at ${pinned}, current is ${current} - a major behind; hold it deliberately or update.`);
    }
  };
  for (const [name, version] of npmPins) behind('npm', name, version);
  for (const [name, version] of pypiPins) behind('pypi', name, version);
  for (const entry of currency.npx ?? []) behind('npm', entry.package, entry.version);

  return { errors, warnings };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
}

async function main() {
  const currency = JSON.parse(fs.readFileSync(CURRENCY_PATH, 'utf8'));
  const npmPins = packageJsonPins(JSON.parse(fs.readFileSync('package.json', 'utf8')));

  // Direct dependencies only: the .in files name them, the .txt files pin
  // them. Transitive pins move constantly and are not a decision anyone made.
  const pypiPins = new Map();
  const directNames = (file, seen = new Set()) => {
    if (seen.has(file) || !fs.existsSync(file)) return new Set();
    seen.add(file);
    const { names, includes } = parseDirectNames(fs.readFileSync(file, 'utf8'));
    for (const inc of includes) {
      for (const n of directNames(`${file.replace(/[^/]*$/, '')}${inc}`, seen)) names.add(n);
    }
    return names;
  };
  for (const stem of ['scripts/requirements', 'scripts/requirements-full']) {
    if (!fs.existsSync(`${stem}.in`) || !fs.existsSync(`${stem}.txt`)) continue;
    const locked = parseRequirementPins(fs.readFileSync(`${stem}.txt`, 'utf8'));
    for (const name of directNames(`${stem}.in`)) {
      if (locked.has(name)) pypiPins.set(name, locked.get(name));
    }
  }

  const latest = new Map();
  const queries = [
    ...[...npmPins.keys(), ...(currency.npx ?? []).map((e) => e.package)].map((name) => ({
      key: `npm:${name}`,
      url: `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
      pick: (data) => data.version,
    })),
    ...[...pypiPins.keys()].map((name) => ({
      key: `pypi:${name}`,
      url: `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
      pick: (data) => data.info?.version,
    })),
  ];
  let failedQueries = 0;
  for (const query of queries) {
    try {
      latest.set(query.key, query.pick(await fetchJson(query.url)) ?? null);
    } catch {
      latest.set(query.key, null);
      failedQueries += 1;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const { errors, warnings } = assess({ currency, npmPins, pypiPins, latest }, today);

  for (const warning of warnings) console.log(`::warning::${warning}`);
  for (const error of errors) console.log(`::error::${error}`);

  // A registry outage must not read as "everything is current".
  if (queries.length && failedQueries > queries.length / 2) {
    console.log(`::error::${failedQueries} of ${queries.length} registry queries failed; the check did not run.`);
    return 1;
  }

  console.log(
    `Checked ${(currency.models ?? []).length} model retirement(s), ` +
      `${(currency.api_versions ?? []).length + (currency.npx ?? []).length} reviewed pin(s), ` +
      `${npmPins.size} npm and ${pypiPins.size} PyPI pin(s): ` +
      `${errors.length} failure(s), ${warnings.length} annotation(s).`
  );
  return errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
