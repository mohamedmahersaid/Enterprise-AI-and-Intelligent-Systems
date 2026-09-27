/**
 * The Python lockfiles' one offline invariant: every package a .in source
 * names appears in the .txt it says it compiles to. Containment, not
 * resolution - versions and hashes need pip-compile and a network, so a
 * package renamed or dropped from the lockfile is caught here and everything
 * finer is left to the regeneration command each .in documents.
 *
 * test/lockfiles.test.mjs runs this over scripts/requirements*.in and their
 * .txt files, so `npm test` fails when they drift apart.
 */

// PEP 503: package names compare case-insensitively with runs of -, _ and .
// collapsed to -, which is why rank_bm25 in the .in matches rank-bm25 in the
// .txt.
const normalize = (name) => name.toLowerCase().replace(/[-_.]+/g, '-');

/** The package names a requirements .in file asks for. */
export function requirementNames(text) {
  const names = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    // Comments, blanks and options (-r another.in, --hash and friends) name
    // no package.
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const m = line.match(/^[A-Za-z0-9][A-Za-z0-9._-]*/);
    if (m) names.push(normalize(m[0]));
  }
  return names;
}

/** The package names a compiled requirements .txt pins. */
export function lockedNames(text) {
  const names = new Set();
  for (const raw of text.split('\n')) {
    const m = raw.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)==/);
    if (m) names.add(normalize(m[1]));
  }
  return names;
}

/** The .in packages the .txt does not pin - the drift the tests fail on. */
export function missingFromLock(inText, txtText) {
  const locked = lockedNames(txtText);
  return requirementNames(inText).filter((name) => !locked.has(name));
}
