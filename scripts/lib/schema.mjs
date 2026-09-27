/**
 * Shape checks for the data files, as plain functions rather than a schema
 * dependency. They exist because a hand edit skips the guards the tooling
 * has: new-leaf rejects a bad slug or level, but nothing rechecked the catalog
 * itself, so `"level": "Guru"` or a stray key sailed through. Each function
 * returns error strings; validate-content runs them all.
 *
 * Two postures, on purpose:
 * - data/catalog.json is written by this repository's own tooling, so its
 *   leaves are checked strictly - an unknown key is a typo, not a feature.
 * - data/validation.json and data/live/*.json are extended over time (new
 *   record fields, new step options), so only the keys known today are
 *   checked and unknown ones pass. A key added by a later change must not
 *   fail on the older validator it races with.
 *
 * data/command-deny.json is validated by scripts/lib/commands.mjs already and
 * is deliberately not re-checked here.
 */
import { NEEDS } from './readiness.mjs';

/** The one place the level vocabulary lives; new-leaf.mjs imports it too. */
export const LEAF_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Enterprise', 'Expert'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const LEAF_KEYS = ['id', 'name', 'level', 'readiness', 'needs', 'tree', 'branch', 'path'];
const LEAF_STRINGS = ['id', 'name', 'level', 'readiness', 'tree', 'branch', 'path'];

const isString = (v) => typeof v === 'string' && v.trim() !== '';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The catalog's own shape. Relationships (counts, paths reaching every leaf,
 * a validated leaf's evidence) are checked elsewhere in validate-content and
 * scripts/lib/readiness.mjs; this is the layer under them, so a leaf with a
 * made-up level or a key nothing reads fails by name instead of being
 * silently carried along.
 */
export function checkCatalogShape(catalog, file = 'data/catalog.json') {
  const errors = [];
  if (!Array.isArray(catalog.leaves)) return [`${file}: "leaves" is not an array.`];

  for (const [key, type] of [
    ['forestId', 'string'], ['name', 'string'], ['description', 'string'], ['repository', 'string'],
    ['treeCount', 'number'], ['branchCount', 'number'], ['expectedLeafCount', 'number'],
    ['pathCount', 'number'],
  ]) {
    if (typeof catalog[key] !== type) errors.push(`${file}: "${key}" is not a ${type}.`);
  }
  if (!isObject(catalog.levelCounts)) errors.push(`${file}: "levelCounts" is not an object.`);
  if (!Array.isArray(catalog.paths)) errors.push(`${file}: "paths" is not an array.`);

  for (const [i, leaf] of catalog.leaves.entries()) {
    const at = `${file}: leaf #${i + 1}${isString(leaf?.id) ? ` (${leaf.id})` : ''}`;
    if (!isObject(leaf)) {
      errors.push(`${at} is not an object.`);
      continue;
    }
    for (const key of LEAF_STRINGS) {
      if (!isString(leaf[key])) errors.push(`${at} has no "${key}".`);
    }
    const unknown = Object.keys(leaf).filter((k) => !LEAF_KEYS.includes(k));
    if (unknown.length) {
      errors.push(`${at} has unknown key(s) ${unknown.join(', ')}; nothing reads them, so they are a typo or drift.`);
    }
    if (isString(leaf.id) && !SLUG.test(leaf.id)) {
      errors.push(`${at} id is not a lowercase hyphenated slug.`);
    }
    if (isString(leaf.level) && !LEAF_LEVELS.includes(leaf.level)) {
      errors.push(`${at} level "${leaf.level}" is not one of ${LEAF_LEVELS.join(', ')}.`);
    }
    if (!Array.isArray(leaf.needs) || !leaf.needs.every((n) => typeof n === 'string')) {
      errors.push(`${at} "needs" is not an array of strings.`);
    } else {
      const unknownNeeds = leaf.needs.filter((n) => !NEEDS[n]);
      if (unknownNeeds.length) {
        errors.push(`${at} needs ${unknownNeeds.join(', ')}, not in the vocabulary ${Object.keys(NEEDS).join(', ')}.`);
      }
    }
    if (isString(leaf.path) && isString(leaf.id) &&
        !new RegExp(`^docs/[^/]+/[^/]+/${leaf.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.md$`).test(leaf.path)) {
      errors.push(`${at} path "${leaf.path}" is not docs/<tree-dir>/<branch-dir>/${leaf.id}.md.`);
    }
  }
  return errors;
}

// The record fields known today. scripts/lib/readiness.mjs checks their
// values (a real leaf, a valid date, an existing workflow, a run URL in this
// repository); this only rejects a record that is not even the right shape.
// Extra fields pass: later records carry more evidence, not less.
const RUN_STRINGS = ['leaf', 'date', 'workflow', 'run', 'environment', 'covered', 'result'];

export function checkValidationShape(validation, file = 'data/validation.json') {
  const errors = [];
  if (!isObject(validation)) return [`${file}: is not a JSON object.`];
  if (!Array.isArray(validation.runs)) return [`${file}: "runs" is not an array.`];
  for (const [i, run] of validation.runs.entries()) {
    const at = `${file}: run #${i + 1}`;
    if (!isObject(run)) {
      errors.push(`${at} is not an object.`);
      continue;
    }
    for (const key of RUN_STRINGS) {
      if (key in run && !isString(run[key])) errors.push(`${at} "${key}" is not a non-empty string.`);
    }
  }
  return errors;
}

// The step and skip shapes live-run.mjs actually reads. Unknown keys pass, at
// the top level and per step, because the spec format grows with the live
// lane; a wrong type in a key it reads today fails before a runner spends an
// hour finding out.
const STEP_TYPES = {
  command: 'number', background: 'boolean', ready: 'string',
  timeout: 'number', stdin: 'string', expect: 'string',
};

export function checkLiveSpec(spec, file) {
  const errors = [];
  if (!isObject(spec)) return [`${file}: is not a JSON object.`];
  if (!Array.isArray(spec.steps) || !spec.steps.length) {
    errors.push(`${file}: "steps" is not a non-empty array.`);
  } else {
    for (const [i, step] of spec.steps.entries()) {
      const at = `${file}: step #${i + 1}`;
      if (!isObject(step)) {
        errors.push(`${at} is not an object.`);
        continue;
      }
      if (!Number.isInteger(step.command) || step.command < 1) {
        errors.push(`${at} "command" is not a positive integer.`);
      }
      for (const [key, type] of Object.entries(STEP_TYPES)) {
        if (key in step && typeof step[key] !== type) errors.push(`${at} "${key}" is not a ${type}.`);
      }
      if (typeof step.expect === 'string') {
        try {
          new RegExp(step.expect);
        } catch (error) {
          errors.push(`${at} "expect" does not compile as a regular expression: ${error.message}`);
        }
      }
    }
  }
  if ('skip' in spec) {
    if (!isObject(spec.skip)) {
      errors.push(`${file}: "skip" is not an object of {"<command number>": "<reason>"}.`);
    } else {
      for (const [key, reason] of Object.entries(spec.skip)) {
        if (!/^\d+$/.test(key)) errors.push(`${file}: skip key "${key}" is not a command number.`);
        if (!isString(reason)) errors.push(`${file}: skip "${key}" has no reason.`);
      }
    }
  }
  if ('files' in spec && (!isObject(spec.files) || !Object.values(spec.files).every((v) => typeof v === 'string'))) {
    errors.push(`${file}: "files" is not an object of {"<name>": "<content>"}.`);
  }
  if ('version' in spec && !isString(spec.version)) errors.push(`${file}: "version" is not a string.`);
  return errors;
}

/**
 * Markdown files under docs/ that the catalog does not know: leaf-shaped
 * content that no navigation, path, check or site build will ever see.
 * READMEs are navigation and fixtures/ holds lab data, so those are exempt;
 * everything else must be a catalog leaf or it is silently dead content.
 */
export function orphanDocs(files, leafPaths) {
  const known = new Set(leafPaths);
  return files.filter((f) =>
    f.split('/').pop() !== 'README.md' &&
    !f.split('/').includes('fixtures') &&
    !known.has(f));
}
