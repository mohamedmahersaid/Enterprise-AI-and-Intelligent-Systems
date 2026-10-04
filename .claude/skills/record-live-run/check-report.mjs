#!/usr/bin/env node
// Checks a transcribed live-run report before it is committed:
//   node .claude/skills/record-live-run/check-report.mjs data/live/runs/<leaf>-<run_id>.json
// It catches the transcription errors validate:content cannot see: a step's
// `text` that differs from the leaf's own Command (Actions log masking may
// have replaced a header value with `***`, which is accepted), a missing
// field, or a $comment without the artifact's sha256. Exit 1 on any problem.

import fs from 'node:fs';
import { parseCommands } from '../../../scripts/lib/live-spec.mjs';

// `setup` is absent from reports made before live-run spec v2, so it is not required.
const REQUIRED = ['$comment', 'leaf', 'run_id', 'head_sha', 'result', 'covered', 'planned', 'skipped', 'environment', 'steps'];

/** True when `printed` equals `original`, treating each `***` as a masked run of one line's characters. */
export function matchesMasked(printed, original) {
  if (!printed.includes('***')) return printed === original;
  const pattern = printed.split('***').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\n]*?');
  return new RegExp(`^${pattern}$`).test(original);
}

export function checkReport(report, leafBody) {
  // A reconstructed record (see its own `reason`) carries no printed steps to compare.
  if (report.reconstructed === true) return [];
  const problems = [];
  for (const key of REQUIRED) if (!(key in report)) problems.push(`missing field "${key}"`);
  if (!/sha256 [0-9a-f]{64}/.test(report.$comment ?? '')) problems.push('$comment does not name the uploaded artifact\'s sha256');
  if (!/^[0-9a-f]{40}$/.test(report.head_sha ?? '')) problems.push('head_sha is not a full 40-character sha');
  const { commands, errors } = parseCommands(leafBody, report.leaf);
  problems.push(...errors);
  for (const step of report.steps ?? []) {
    const original = commands.get(step.command);
    if (original === undefined) problems.push(`step for Command ${step.command}: the leaf has no such Command`);
    else if (!matchesMasked(step.text, original)) problems.push(`Command ${step.command}: "text" differs from the leaf's fence`);
    if (step.ok !== true && report.result === 'pass') problems.push(`Command ${step.command}: ok is not true in a passing report`);
  }
  return problems;
}

function main(file) {
  if (!file) {
    console.error('usage: check-report.mjs data/live/runs/<leaf>-<run_id>.json');
    return 1;
  }
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const leaf = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8')).leaves.find((l) => l.id === report.leaf);
  if (!leaf) {
    console.error(`${file}: leaf "${report.leaf}" is not in data/catalog.json`);
    return 1;
  }
  const problems = checkReport(report, fs.readFileSync(leaf.path, 'utf8'));
  for (const p of problems) console.error(`${file}: ${p}`);
  if (!problems.length) {
    console.log(report.reconstructed ? `${file}: reconstructed record, not compared` : `${file}: ${report.steps.length} step(s) match ${leaf.path}`);
  }
  return problems.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('check-report.mjs')) process.exit(main(process.argv[2]));
