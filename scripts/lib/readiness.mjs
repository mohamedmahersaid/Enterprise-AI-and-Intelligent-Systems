/**
 * Says, for every leaf, how far its content has been proven, and what it would
 * take to prove it further.
 *
 * Every leaf ended with the same sentence - validate everything in an isolated
 * lab before production use - which was true of all 34 and so told a reader
 * nothing about any one of them. The gates prove a good deal offline: commands
 * follow the safety rules, scripts start and stop cleanly, diagrams parse,
 * references resolve. None of that is the same as having run the commands
 * against the service they describe, and a reader deciding how much to trust a
 * leaf needs to know which of the two it has had.
 *
 * So each leaf carries a readiness level, and the level is a claim the
 * repository has to back:
 *
 *   lab        checked offline on every pull request, never run live here.
 *   validated  also run end-to-end against the real service, by a CI run whose
 *              URL, date and environment are recorded in data/validation.json.
 *
 * There is deliberately no "production" level. Whether a pattern is fit for a
 * production system depends on the reader's identity model, network, data and
 * service levels, none of which a curriculum can see. The generated document
 * says so rather than offering a badge it could not earn.
 *
 * Each leaf also records what a live run needs - an Azure subscription, a GPU,
 * a Kubernetes cluster, or nothing beyond a stock CI runner - so the leaves
 * that can be validated for free are known, and the rest say what is missing.
 * That list is editorial, but it has a floor: a leaf whose commands call `az`
 * must list Azure, and so on for each tool below. An author can add a need the
 * tools do not reveal; they cannot leave out one the tools do.
 */
import fs from 'node:fs';
import path from 'node:path';

export const VALIDATION_PATH = 'data/validation.json';

export const LEVELS = {
  lab: {
    label: 'Lab',
    summary: 'checked offline, not yet run against a live service',
  },
  validated: {
    label: 'Validated',
    summary: 'run end-to-end against the live service by a recorded CI run',
  },
};

/** In the order they are listed; the phrase completes "A live run needs ...". */
export const NEEDS = {
  runner: {
    label: 'Stock CI runner',
    phrase: 'only a stock CI runner',
    detail:
      'Nothing beyond a GitHub-hosted Ubuntu runner: Python 3, Docker, packages ' +
      'installed from public registries, and services started in containers.',
  },
  ollama: {
    label: 'Ollama',
    phrase: 'a local Ollama server',
    detail: 'A local Ollama server with a small model pulled. A CPU is enough, so a CI runner can host it.',
  },
  gpu: {
    label: 'NVIDIA GPU',
    phrase: 'an NVIDIA GPU',
    detail: 'An NVIDIA GPU with its driver and CUDA runtime. Not available on standard hosted runners.',
  },
  azure: {
    label: 'Azure subscription',
    phrase: 'an Azure subscription',
    detail:
      'An Azure subscription with rights to create the resources the leaf creates, ' +
      'and a budget for them. Runs cost money and need credentials, so none are automated here yet.',
  },
  kubernetes: {
    label: 'Kubernetes cluster',
    phrase: 'a Kubernetes cluster',
    detail: 'A Kubernetes cluster and kubectl access to it. A disposable local cluster (kind, k3d) covers most leaves.',
  },
  slurm: {
    label: 'Slurm cluster',
    phrase: 'a Slurm cluster',
    detail: 'A Slurm-scheduled cluster to submit jobs to.',
  },
  'hosted-api': {
    label: 'Hosted model API',
    phrase: "a hosted model provider's API key",
    detail: 'An API key for a hosted model provider other than Azure.',
  },
  'own-service': {
    label: 'Your own service',
    phrase: 'a service you already operate',
    detail:
      'A system the leaf assumes you run already - a gateway, an application, an inventory ' +
      'export - which its commands address only through a placeholder.',
  },
};

/**
 * The floor: a command that proves a need. Only tools whose need is
 * unambiguous are listed. `curl` is not, because the same curl can address
 * Ollama, Azure or an internal gateway.
 */
const TOOL_NEEDS = {
  az: 'azure',
  kubectl: 'kubernetes',
  helm: 'kubernetes',
  'nvidia-smi': 'gpu',
  vllm: 'gpu',
  sbatch: 'slurm',
  squeue: 'slurm',
  srun: 'slurm',
  sinfo: 'slurm',
  scontrol: 'slurm',
  sacct: 'slurm',
  scancel: 'slurm',
  ollama: 'ollama',
};

/** Fences whose contents are not shell: diagrams, code, data and queries. */
const NOT_SHELL = new Set(['mermaid', 'python', 'py', 'json', 'jsonl', 'yaml', 'yml', 'sql', 'kql', 'dockerfile', 'toml', 'ini']);

/** Words that run the command after them rather than being the command. */
const WRAPPERS = new Set(['sudo', 'env', 'time', 'exec', 'nohup', 'watch', 'command']);

const ORDER = Object.keys(NEEDS);

export function loadValidation() {
  return JSON.parse(fs.readFileSync(VALIDATION_PATH, 'utf8'));
}

/**
 * The lines of every fenced block that could hold a shell command - text,
 * bash, sh, powershell or unlabelled, indented or not. The floor is only a
 * floor if it cannot be stepped around by choosing a different fence label.
 */
function shellLines(body) {
  const out = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const open = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
    if (!fence && open) {
      fence = { mark: open[1], shell: !NOT_SHELL.has(open[2].toLowerCase()) };
    } else if (fence && line.trim().startsWith(fence.mark)) {
      fence = null;
    } else if (fence?.shell) {
      out.push(line);
    }
  }
  return out;
}

/**
 * The tools a line runs: every command in it, not only the first word, so
 * `sudo az ...`, `X=1 kubectl ...`, `cat f | kubectl apply -f -` and
 * `$(kubectl get nodes)` all count, and `/usr/bin/kubectl` is kubectl.
 */
function toolsIn(line) {
  const text = line.trim().replace(/^(?:\$|PS>|>)\s+/, '');
  if (!text || text.startsWith('#')) return [];
  const tools = [];
  for (const segment of text.split(/\|\||&&|[|;&`]|\$\(|\(/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    while (words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]) || WRAPPERS.has(words[0]))) words.shift();
    if (words.length) tools.push(path.posix.basename(words[0].replace(/\\/g, '/')).replace(/\.exe$/i, ''));
  }
  return tools;
}

/**
 * Every tool a leaf's shell commands run, wherever in a line it appears. Shared
 * with ASSUMPTIONS.md, so the tools a reader is told to install and the needs
 * the floor enforces are read from the commands the same way.
 */
export function commandTools(body) {
  const found = new Set();
  for (const line of shellLines(body)) {
    for (const tool of toolsIn(line)) found.add(tool);
  }
  return found;
}

/** The needs a leaf's own commands prove, in canonical order. */
export function impliedNeeds(body) {
  const found = new Set();
  for (const tool of commandTools(body)) {
    if (TOOL_NEEDS[tool]) found.add(TOOL_NEEDS[tool]);
  }
  return ORDER.filter((n) => found.has(n));
}

/** The Actions run id in a run URL, which GitHub issues in increasing order. */
const runId = (run) => Number(String(run.run ?? '').match(/\/actions\/runs\/(\d+)/)?.[1] ?? 0);

/**
 * The latest recorded run for each leaf: by date, then by run id, so two runs
 * on one day are ordered by when they ran rather than where they sit in the
 * file.
 */
export function latestRuns(validation) {
  const latest = new Map();
  for (const run of validation.runs ?? []) {
    const seen = latest.get(run.leaf);
    const later = !seen || run.date > seen.date || (run.date === seen.date && runId(run) > runId(seen));
    if (later) latest.set(run.leaf, run);
  }
  return latest;
}

const listPhrase = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** "A live run needs an Azure subscription and a Kubernetes cluster." */
export function needsSentence(needs) {
  return `A live run needs ${listPhrase(needs.map((n) => NEEDS[n].phrase))}.`;
}

/**
 * The line each leaf carries under its title. It is asserted, not generated
 * into the leaf, the same way the frontmatter is: the author writes it and the
 * check says exactly what it should read.
 */
export function readinessLine(leaf, run) {
  const doc = path.relative(path.dirname(leaf.path), 'READINESS.md').split(path.sep).join('/');
  const level = LEVELS[leaf.readiness];
  if (leaf.readiness === 'validated' && run) {
    return `**Readiness:** [${level.label}](${doc}#validated) - run live on ${run.date} ([evidence](${run.run})).`;
  }
  return `**Readiness:** [${level.label}](${doc}#lab) - ${level.summary}. ${needsSentence(leaf.needs)}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;

/**
 * A real calendar date no later than today (UTC). A typo into the future
 * would otherwise count as the latest run for years, and hide every real
 * failure recorded after it.
 */
function dateProblem(date, today) {
  if (!DATE.test(date)) return 'is not YYYY-MM-DD';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return 'is not a calendar date';
  if (date > today) return `is after today (${today})`;
  return null;
}
const RUN_FIELDS = ['leaf', 'date', 'workflow', 'run', 'environment', 'covered', 'result'];

/**
 * Returns error strings. Rules:
 *
 * 1. Every leaf has a known readiness and a non-empty, ordered, known needs
 *    list; `runner` stands alone, because any other need already implies one.
 * 2. Every need a leaf's commands prove is listed.
 * 3. Every run record is complete: a known leaf, a real date no later than
 *    today, a workflow under .github/workflows/ that exists, a run URL in this
 *    repository's Actions, and a pass or fail.
 * 4. A leaf is validated exactly when its latest recorded run passed. A leaf
 *    whose latest run failed is back to lab until a new pass is recorded.
 */
export function checkReadiness(
  catalog,
  validation = loadValidation(),
  repository = 'mohamedmahersaid/Enterprise-AI-and-Intelligent-Systems',
  today = new Date().toISOString().slice(0, 10),
) {
  const errors = [];
  const ids = new Set(catalog.leaves.map((l) => l.id));

  const runUrl = new RegExp(`^https://github\\.com/${repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/actions/runs/\\d+(?:/job/\\d+)?$`);
  for (const [i, run] of (validation.runs ?? []).entries()) {
    const at = `${VALIDATION_PATH}: run #${i + 1}${run.leaf ? ` (${run.leaf})` : ''}`;
    for (const field of RUN_FIELDS) {
      if (!run[field]) errors.push(`${at} has no "${field}".`);
    }
    if (run.leaf && !ids.has(run.leaf)) errors.push(`${at} names no leaf in the catalog.`);
    const badDate = run.date && dateProblem(run.date, today);
    if (badDate) errors.push(`${at} date "${run.date}" ${badDate}.`);
    if (run.workflow && !WORKFLOW.test(run.workflow)) {
      errors.push(`${at} workflow ${run.workflow} is not a file under .github/workflows/.`);
    } else if (run.workflow && !fs.existsSync(run.workflow)) {
      errors.push(`${at} workflow ${run.workflow} does not exist.`);
    }
    if (run.run && !runUrl.test(run.run)) {
      errors.push(`${at} run "${run.run}" is not a run URL in ${repository}'s GitHub Actions.`);
    }
    if (run.result && !['pass', 'fail'].includes(run.result)) {
      errors.push(`${at} result "${run.result}" is neither pass nor fail.`);
    }
  }
  const latest = latestRuns(validation);

  for (const leaf of catalog.leaves) {
    if (!LEVELS[leaf.readiness]) {
      errors.push(`data/catalog.json: leaf ${leaf.id} readiness "${leaf.readiness ?? ''}" is not one of ${Object.keys(LEVELS).join(', ')}.`);
    }
    if (!Array.isArray(leaf.needs) || !leaf.needs.length) {
      errors.push(`data/catalog.json: leaf ${leaf.id} has no "needs"; list what a live run requires (${ORDER.join(', ')}).`);
      continue;
    }
    const unknown = leaf.needs.filter((n) => !NEEDS[n]);
    if (unknown.length) {
      errors.push(`data/catalog.json: leaf ${leaf.id} needs ${unknown.join(', ')}, which is not one of ${ORDER.join(', ')}.`);
      continue;
    }
    const canonical = ORDER.filter((n) => leaf.needs.includes(n));
    if (canonical.join() !== leaf.needs.join()) {
      errors.push(`data/catalog.json: leaf ${leaf.id} needs should read [${canonical.join(', ')}] - no repeats, in the order ${ORDER.join(', ')}.`);
    }
    if (leaf.needs.includes('runner') && leaf.needs.length > 1) {
      errors.push(`data/catalog.json: leaf ${leaf.id} lists runner alongside other needs; runner means nothing else is needed.`);
    }

    if (fs.existsSync(leaf.path)) {
      const missing = impliedNeeds(fs.readFileSync(leaf.path, 'utf8')).filter((n) => !leaf.needs.includes(n));
      if (missing.length) {
        errors.push(
          `data/catalog.json: leaf ${leaf.id} commands call tools that need ${missing.join(', ')}, ` +
            'which its needs do not list.'
        );
      }
    }

    const run = latest.get(leaf.id);
    if (leaf.readiness === 'validated' && run?.result !== 'pass') {
      errors.push(
        `data/catalog.json: leaf ${leaf.id} is validated, but ${VALIDATION_PATH} ` +
          (run ? `records its latest run on ${run.date} as ${run.result}` : 'records no run for it') +
          '. Record a passing run, or set it back to lab.'
      );
    }
    if (leaf.readiness === 'lab' && run?.result === 'pass') {
      errors.push(
        `data/catalog.json: leaf ${leaf.id} is lab, but ${VALIDATION_PATH} records a passing run on ${run.date}. ` +
          'Set it to validated.'
      );
    }
  }
  return errors;
}

/** The leaf's readiness header line, or an error saying what it should read. */
export function checkReadinessLine(leaf, body, validation = loadValidation()) {
  // A missing or unknown level or need is reported by checkReadiness; there is
  // no correct line to state until it is fixed.
  if (!LEVELS[leaf.readiness] || !Array.isArray(leaf.needs) || !leaf.needs.length || leaf.needs.some((n) => !NEEDS[n])) {
    return null;
  }
  const want = readinessLine(leaf, latestRuns(validation).get(leaf.id));

  // Exactly one readiness line, outside code, in the header block under the
  // H1 - a second one further down could contradict the first, and one inside
  // a code fence is not rendered as the leaf's claim at all.
  const lines = body.split('\n');
  let fenced = false;
  const found = [];
  for (const [i, line] of lines.entries()) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fenced = !fenced;
    else if (!fenced && line.startsWith('**Readiness:**')) found.push(i);
  }
  if (found.length > 1) {
    return `${leaf.path}: has ${found.length} readiness lines (lines ${found.map((i) => i + 1).join(', ')}); keep only the one under its title.`;
  }
  const h1 = lines.findIndex((l) => l.startsWith('# '));
  let end = h1 + 1;
  while (end < lines.length && !lines[end].trim()) end++;
  while (end < lines.length && lines[end].trim()) end++;
  const at = found[0];
  if (at === undefined || h1 < 0 || at < h1 || at >= end) {
    return `${leaf.path}: has no readiness line in the header block under its title; add it after the **Forest:** line:\n    ${want}`;
  }
  if (lines[at] === want) return null;
  return `${leaf.path}:${at + 1} readiness line reads "${lines[at]}"; it should read:\n    ${want}`;
}

/** READINESS.md, generated from the catalog and the run records. */
export function renderReadinessMd(catalog, validation = loadValidation()) {
  const latest = latestRuns(validation);
  const count = (level) => catalog.leaves.filter((l) => l.readiness === level).length;
  const total = catalog.leaves.length;
  const escape = (s) => s.replace(/\|/g, '\\|');
  // Rendered even from a malformed catalog, so the errors checkReadiness
  // reports are not lost to a crash here.
  const needsOf = (l) => (Array.isArray(l.needs) ? l.needs : []);
  const free = catalog.leaves.filter((l) => needsOf(l).length && needsOf(l).every((n) => n === 'runner' || n === 'ollama')).length;

  const out = [
    '# Readiness',
    '',
    '<!-- Generated by `npm run regen` from data/catalog.json and data/validation.json. Do not edit. -->',
    '',
    'Every leaf says how far its content has been proven. The level is a claim the',
    'repository backs with evidence, and `npm run validate` fails when a leaf claims',
    'more than its evidence supports.',
    '',
    `**${total} leaves:** ${Object.entries(LEVELS).map(([id, l]) => `${l.label}: ${count(id)}`).join(' · ')}`,
    '',
    '## Lab',
    '',
    'Checked offline on every pull request, and not yet run against the service it',
    'describes. For a lab leaf, the checks establish that:',
    '',
    '- every command block is free of literal credentials, destructive operations,',
    '  `curl | sh` and plaintext `http://`',
    '- every Python script compiles and declares its third-party dependencies, and',
    '  when started bare prints a usage line or names what to set rather than',
    '  crashing - except a script whose dependency CI does not install, which is',
    '  reported as skipped by name rather than counted as passing',
    '- every diagram parses, every internal link resolves, and every reference links',
    '  the source it names',
    '- every pinned model, API version and image is recorded in',
    '  [ASSUMPTIONS.md](ASSUMPTIONS.md), and no retired certification is cited',
    '',
    'What they cannot establish is that the commands still do what the leaf says',
    'against today\'s service: a flag renamed, a model withdrawn, or a default changed',
    'passes every offline check. Reproduce a lab leaf in an isolated environment and',
    'capture the evidence its lab asks for before relying on it.',
    '',
    '## Validated',
    '',
    'Also run end-to-end against the live service by a CI workflow in this',
    `repository. Each run is recorded in [${VALIDATION_PATH}](${VALIDATION_PATH}) with its date,`,
    'workflow, environment, the commands it covered, and the URL of the run itself,',
    'so the evidence can be opened rather than taken on trust. A leaf is validated',
    'only while its latest recorded run passed: a recorded failure puts it back to',
    'lab until a new pass is recorded.',
    '',
    'Validated means the commands worked, as written, in the recorded environment on',
    'the recorded date. It does not mean they will work in yours.',
    '',
    '## Production readiness is yours to establish',
    '',
    'There is no production level, and there will not be one. Whether a pattern is',
    'fit for a production system depends on your identity model, network boundaries,',
    'data classification, quotas, service levels and change process - none of which',
    'this repository can see. The Operational automation and Troubleshooting sections',
    'of each leaf are inputs to that decision, not a substitute for it.',
    '',
    '## What a live run needs',
    '',
    'Each leaf records what running its commands end-to-end requires. The list is',
    'editorial, with a floor the check enforces: a leaf whose shell commands call',
    '`az` must list an Azure subscription, `kubectl` or `helm` a Kubernetes cluster,',
    '`nvidia-smi` or `vllm` a GPU, a Slurm command (`sbatch`, `srun`, `squeue`,',
    '`sinfo`, `scontrol`, `sacct`, `scancel`) a Slurm cluster, and `ollama` an Ollama',
    'server - wherever in a line the tool appears, and in any fence other than code,',
    'data and diagrams. Tools called from inside a Python script are not detected.',
    '',
    '| Need | What it means | Leaves |',
    '| --- | --- | ---: |',
    ...Object.entries(NEEDS).map(([id, n]) =>
      `| ${n.label} | ${n.detail} | ${catalog.leaves.filter((l) => needsOf(l).includes(id)).length} |`),
    '',
    `${free} of ${total} leaves need only a stock runner or Ollama, so CI can validate them`,
    'at no cost. The rest need infrastructure or credentials this repository does not hold.',
    '',
    '## Every leaf',
    '',
    '| Leaf | Level | Readiness | A live run needs | Latest run |',
    '| --- | --- | --- | --- | --- |',
    ...catalog.leaves.map((l) => {
      const run = latest.get(l.id);
      const evidence = run ? `[${run.result} ${run.date}](${run.run})` : 'none recorded';
      return `| [${escape(l.name)}](${l.path}) | ${l.level} | ${LEVELS[l.readiness]?.label ?? l.readiness} | ` +
        `${needsOf(l).map((n) => NEEDS[n]?.label ?? n).join(', ')} | ${evidence} |`;
    }),
    '',
    '## How a leaf becomes validated',
    '',
    '1. A workflow under `.github/workflows/` runs the leaf\'s commands against the',
    '   live service, from a job that holds no write token. The check confirms the',
    '   workflow file exists; that its job holds no write token is confirmed in review.',
    `2. A passing run is recorded in \`${VALIDATION_PATH}\`: the leaf, date, workflow, run URL,`,
    '   environment and the commands covered.',
    '3. The leaf\'s readiness is set to `validated` in `data/catalog.json` and its',
    '   frontmatter, its readiness line is updated, and `npm run regen` rewrites this file.',
    '',
    'Recording is a pull request, reviewed like any other change: the run proves the',
    'commands worked, and the review confirms the run covered what the record says.',
    '',
  ];
  return `${out.join('\n')}\n`.replace(/\n\n$/, '\n');
}

export function writeReadinessMd(catalog) {
  fs.writeFileSync('READINESS.md', renderReadinessMd(catalog));
}
