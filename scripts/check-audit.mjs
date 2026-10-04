#!/usr/bin/env node
// The npm dependency audit gate, run by validate.yml in place of a bare
// `npm audit --audit-level=high`.
//
// It fails on any high or critical advisory, exactly as before, except one
// listed in data/audit-exceptions.json. An exception exists for the case
// `npm audit` cannot express: an advisory with no patched release anywhere,
// reached only through a dev tool's handling of this repository's own input.
// Every exception names its advisory, package, reason and a review_by date;
// past that date the exception stops counting and the gate fails again, so an
// accepted risk is re-examined rather than forgotten (as data/currency.json
// does for pins). An exception the audit no longer reports only annotates,
// so it can be deleted. Low and moderate findings never fail the gate.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EXCEPTIONS_PATH = 'data/audit-exceptions.json';
const FAILING = new Set(['high', 'critical']);

/** GHSA id from an advisory URL, or the URL itself when it has none. */
export const advisoryId = (url = '') => url.match(/GHSA(-[23456789cfghjmpqrvwx]{4}){3}/)?.[0] ?? url;

/**
 * The distinct root advisories in an `npm audit --json` report: the `via`
 * entries that are objects (strings only point at another vulnerable
 * package), keyed by advisory id.
 */
export function rootAdvisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object') continue;
      const id = advisoryId(via.url);
      if (!found.has(id)) found.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url });
    }
  }
  return [...found.values()];
}

/** Pure verdict over an audit report and the exceptions file, for a given day. */
export function assessAudit(report, exceptionsFile, today) {
  const errors = [];
  const warnings = [];
  if (report.error) {
    errors.push(`npm audit did not run: ${report.error.summary ?? JSON.stringify(report.error)}`);
    return { errors, warnings };
  }
  const exceptions = new Map((exceptionsFile.exceptions ?? []).map((e) => [e.advisory, e]));
  const advisories = rootAdvisories(report);

  for (const adv of advisories.filter((a) => FAILING.has(a.severity))) {
    const ex = exceptions.get(adv.id);
    if (!ex) {
      errors.push(`${adv.severity} ${adv.id} in ${adv.package}: ${adv.title} (${adv.url}). Update the dependency, or record a reviewed exception in ${EXCEPTIONS_PATH}.`);
    } else if (ex.package !== adv.package) {
      errors.push(`${adv.id}: the exception names package "${ex.package}" but the advisory is in "${adv.package}".`);
    } else if (!(ex.review_by >= today)) {
      errors.push(`${adv.id} in ${adv.package}: exception expired on ${ex.review_by}. Re-check for a fix; renew review_by only with a new reason.`);
    } else {
      warnings.push(`${adv.severity} ${adv.id} in ${adv.package} accepted until ${ex.review_by}: ${ex.reason}`);
    }
  }
  const reported = new Set(advisories.map((a) => a.id));
  for (const id of exceptions.keys()) {
    if (!reported.has(id)) warnings.push(`${id}: exception no longer needed (not reported by npm audit); remove it from ${EXCEPTIONS_PATH}.`);
  }
  return { errors, warnings };
}

function main() {
  let raw;
  try {
    raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    raw = e.stdout; // npm audit exits non-zero whenever it finds anything
  }
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    console.log('::error::npm audit produced no JSON report; the audit did not run.');
    return 1;
  }
  const exceptionsFile = JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, 'utf8'));
  const { errors, warnings } = assessAudit(report, exceptionsFile, new Date().toISOString().slice(0, 10));
  for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`::error::${e}`);
  const m = report.metadata?.vulnerabilities ?? {};
  console.log(`npm audit: ${m.critical ?? 0} critical, ${m.high ?? 0} high, ${m.moderate ?? 0} moderate, ${m.low ?? 0} low; ${errors.length} failure(s), ${warnings.length} annotation(s).`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
