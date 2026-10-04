#!/usr/bin/env node
// Health check for the Claude Code environment of this repository.
//   node .claude/bin/healthcheck.mjs [--offline]
// Prints one line per check as PASS / WARN / FAIL / NOT CONFIGURED and exits 1
// on any FAIL. Read-only: it inspects, never installs or edits. NOT CONFIGURED
// means deliberately absent (see .claude/platform/MCP_CATALOG.md), not broken.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The YAML frontmatter of a markdown file as a flat key -> raw value map (enough for name/description/paths). */
export function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const out = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].replace(/^["']|["']$/g, '');
    } else if (key && /^\s+-\s+/.test(line)) {
      out[key] = `${out[key] ? `${out[key]},` : ''}${line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '')}`;
    }
  }
  return out;
}

/** Problems with the skills, agents and rules under a .claude directory. */
export function checkClaudeDir(dir) {
  const problems = [];
  const counts = { skills: 0, agents: 0, rules: 0 };
  const skillsDir = path.join(dir, 'skills');
  for (const name of fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : []) {
    const file = path.join(skillsDir, name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    counts.skills += 1;
    const fm = frontmatter(fs.readFileSync(file, 'utf8'));
    if (!fm?.description) problems.push(`skills/${name}: no description in frontmatter`);
    if (fm?.name && fm.name !== name) problems.push(`skills/${name}: name "${fm.name}" differs from its directory`);
  }
  const agentsDir = path.join(dir, 'agents');
  for (const name of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')) : []) {
    counts.agents += 1;
    const fm = frontmatter(fs.readFileSync(path.join(agentsDir, name), 'utf8'));
    if (!fm?.name || !fm?.description) problems.push(`agents/${name}: needs name and description`);
    else if (`${fm.name}.md` !== name) problems.push(`agents/${name}: name "${fm.name}" differs from its file`);
  }
  const rulesDir = path.join(dir, 'rules');
  for (const name of fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md')) : []) {
    counts.rules += 1;
    if (!frontmatter(fs.readFileSync(path.join(rulesDir, name), 'utf8'))?.paths) {
      problems.push(`rules/${name}: no paths frontmatter, so it loads in every session`);
    }
  }
  return { problems, counts };
}

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }).trim();
  } catch {
    return null;
  }
};

async function reachable(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const offline = process.argv.includes('--offline');
  const results = [];
  const add = (status, area, detail) => results.push({ status, area, detail });
  process.chdir(ROOT);

  const cc = run('claude', ['--version']);
  add(cc ? 'PASS' : 'WARN', 'Claude Code', cc ?? 'claude CLI not on PATH');

  if (fs.existsSync('CLAUDE.md')) {
    const lines = fs.readFileSync('CLAUDE.md', 'utf8').split('\n').length;
    add(lines <= 200 ? 'PASS' : 'WARN', 'CLAUDE.md', `${lines} lines (target <= 200)`);
  } else add('FAIL', 'CLAUDE.md', 'missing');

  let settings = null;
  try {
    settings = JSON.parse(fs.readFileSync('.claude/settings.json', 'utf8'));
    add('PASS', 'Settings', '.claude/settings.json parses');
  } catch (e) {
    add('FAIL', 'Settings', `.claude/settings.json: ${e.message}`);
  }
  if (settings) {
    const deny = settings.permissions?.deny ?? [];
    const missing = ['Read(./node_modules/**)', 'Read(./.git/**)', 'Read(./.env)'].filter((r) => !deny.includes(r));
    add(missing.length ? 'WARN' : 'PASS', 'Permissions', missing.length ? `deny rules missing: ${missing.join(', ')}` : `${deny.length} deny, ${(settings.permissions?.ask ?? []).length} ask, ${(settings.permissions?.allow ?? []).length} allow rules`);
    const hookFiles = ['.claude/hooks/session-start.sh', '.claude/hooks/guard-derived.mjs'];
    const bad = hookFiles.filter((f) => !fs.existsSync(f) || !(fs.statSync(f).mode & 0o111));
    add(bad.length ? 'FAIL' : 'PASS', 'Hooks', bad.length ? `missing or not executable: ${bad.join(', ')}` : 'SessionStart and PreToolUse scripts present and executable');
  }

  const { problems, counts } = checkClaudeDir('.claude');
  add(problems.length ? 'FAIL' : 'PASS', 'Skills/Agents/Rules', problems.length ? problems.join('; ') : `${counts.skills} skills, ${counts.agents} agents, ${counts.rules} path-scoped rules`);

  if (fs.existsSync('.mcp.json')) {
    try {
      const servers = Object.keys(JSON.parse(fs.readFileSync('.mcp.json', 'utf8')).mcpServers ?? {});
      add('PASS', 'MCP (project)', `${servers.length} server(s): ${servers.join(', ') || 'none'}`);
    } catch (e) {
      add('FAIL', 'MCP (project)', `.mcp.json: ${e.message}`);
    }
  } else add('NOT CONFIGURED', 'MCP (project)', 'no .mcp.json by design; GitHub and Microsoft Learn come from account connectors');

  const node = process.versions.node;
  add(node.startsWith('22.') ? 'PASS' : 'WARN', 'Runtime: Node', `${node} (CI uses 22)`);
  const lockOk = fs.existsSync('node_modules/.package-lock.json') &&
    fs.statSync('node_modules/.package-lock.json').mtimeMs >= fs.statSync('package-lock.json').mtimeMs;
  add(lockOk ? 'PASS' : 'FAIL', 'Runtime: node_modules', lockOk ? 'installed and current with package-lock.json' : 'missing or older than package-lock.json; run npm ci');

  const leafPy = process.env.LEAF_PYTHON;
  const pyVer = leafPy ? run(leafPy, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])']) : null;
  if (pyVer === '3.12') add('PASS', 'Runtime: LEAF_PYTHON', `${leafPy} (3.12, as CI)`);
  else add('WARN', 'Runtime: LEAF_PYTHON', leafPy ? `${leafPy} is ${pyVer ?? 'not runnable'}, CI uses 3.12` : 'unset; validate:python/scripts fall back to python3');

  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = run('git', ['status', '--porcelain']);
  add(branch ? 'PASS' : 'FAIL', 'Git', branch ? `on ${branch}, ${dirty ? 'uncommitted changes' : 'clean'}` : 'not a git work tree');
  const tracked = (run('git', ['ls-files']) ?? '').split('\n');
  const risky = tracked.filter((f) => /(^|\/)(\.env(\..*)?|id_rsa|id_ed25519)$|\.(pem|pfx|p12|key)$/.test(f));
  add(risky.length ? 'FAIL' : 'PASS', 'Security: tracked secrets', risky.length ? `credential-like files tracked: ${risky.join(', ')}` : 'no .env, key or certificate files tracked');

  for (const [tool, why] of [['actionlint', 'workflow lint'], ['shellcheck', 'hook and script lint']]) {
    const v = run(tool, ['--version']);
    add(v ? 'PASS' : 'WARN', `Tool: ${tool}`, v ? v.split('\n').find((l) => /\d/.test(l)) : `not installed (${why}); add to the environment setup script`);
  }
  add(run('docker', ['info']) ? 'PASS' : 'NOT CONFIGURED', 'Docker', 'daemon not used by any gate');
  for (const cli of ['az', 'kubectl', 'terraform']) {
    add(run(cli, ['version']) ?? run(cli, ['--version']) ? 'PASS' : 'NOT CONFIGURED', `Cloud CLI: ${cli}`, 'only for the owner-gated Azure lane');
  }

  if (!offline) {
    for (const [name, url] of [['npm registry', 'https://registry.npmjs.org/'], ['PyPI', 'https://pypi.org/simple/'], ['GitHub API', 'https://api.github.com/']]) {
      add((await reachable(url)) ? 'PASS' : 'WARN', `Network: ${name}`, url);
    }
  }

  const width = Math.max(...results.map((r) => r.area.length));
  for (const r of results) console.log(`${r.status.padEnd(14)} ${r.area.padEnd(width)}  ${r.detail}`);
  const tally = ['PASS', 'WARN', 'FAIL', 'NOT CONFIGURED'].map((s) => `${results.filter((r) => r.status === s).length} ${s}`).join(', ');
  console.log(`\n${tally}`);
  return results.some((r) => r.status === 'FAIL') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
