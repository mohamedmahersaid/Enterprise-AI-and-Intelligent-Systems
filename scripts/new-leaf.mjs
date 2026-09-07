/**
 * Scaffolds a new leaf and updates every file that has to know about it.
 *
 * Validation covers heading hierarchy, frontmatter/catalog agreement, catalog
 * self-consistency, CATALOG.md coverage and the README figures, so adding a
 * leaf by hand means getting six navigation files right at once. This writes
 * a leaf that already satisfies the structural rules, leaving the author to
 * replace the TODO markers with content — which validation requires before the
 * leaf can merge.
 *
 *   npm run new-leaf -- --id ai-example-leaf --title "Example Leaf" \
 *     --level Intermediate --tree "AI Platform Engineering" \
 *     --branch "Model and Feature Lifecycle"
 */
import fs from 'node:fs';
import path from 'node:path';
import { readCatalog, writeCatalog, recount, regenerate, group } from './lib/derive.mjs';

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Enterprise', 'Expert'];
const SECTIONS = [
  ['Explanation', 'TODO: explain the problem this leaf solves and the mental model a reader needs. Use ### subsections for distinct topics.'],
  ['Architecture and flow', null],
  ['Commands', null],
  ['Automation scripts', null],
  ['Lab', null],
  ['Operational automation', null],
  ['Troubleshooting', null],
  ['Interview questions', null],
  ['Certification alignment', 'TODO: five entries, each naming a certification and the specific skill area, including one vendor-neutral item.'],
  ['References', 'TODO: five primary sources - vendor documentation and specifications, not blog posts.'],
  ['Suggested video search', 'TODO: one line of search keywords.'],
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) fail(`Unexpected argument: ${argv[i]}`);
    if (argv[i + 1] === undefined) fail(`Missing value for ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function fail(message, detail) {
  console.error(`error: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const catalog = readCatalog();
const trees = group(catalog);

for (const required of ['id', 'title', 'level', 'tree', 'branch']) {
  if (!args[required]) {
    fail(`--${required} is required`,
      'usage: npm run new-leaf -- --id <slug> --title "<title>" --level <level> --tree "<tree>" --branch "<branch>"');
  }
}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.id)) fail(`--id must be a lowercase slug, got '${args.id}'`);
if (catalog.leaves.some((l) => l.id === args.id)) fail(`a leaf with id '${args.id}' already exists`);
if (!LEVELS.includes(args.level)) fail(`--level must be one of: ${LEVELS.join(', ')}`);
if (!trees.has(args.tree)) fail(`unknown tree '${args.tree}'`, `known trees:\n${[...trees.keys()].map((t) => `  ${t}`).join('\n')}`);
if (!trees.get(args.tree).has(args.branch)) {
  fail(`unknown branch '${args.branch}' in tree '${args.tree}'`,
    `branches in that tree:\n${[...trees.get(args.tree).keys()].map((b) => `  ${b}`).join('\n')}`);
}

const siblings = trees.get(args.tree).get(args.branch);
const leafPath = path.join(path.dirname(siblings[0].path), `${args.id}.md`);
if (fs.existsSync(leafPath)) fail(`${leafPath} already exists`);

const body = SECTIONS.map(([heading, todo]) => {
  if (heading === 'Architecture and flow') {
    return `## ${heading}\n\n\`\`\`mermaid\nflowchart TD\n    A[TODO: first step] --> B[TODO: second step]\n    B --> C{TODO: decision}\n    C -->|TODO| D[TODO: outcome]\n\`\`\``;
  }
  if (heading === 'Commands') {
    return `## ${heading}\n\n${[1, 2, 3, 4, 5, 6].map((n) =>
      `### Command ${n}\n\nTODO: what this command shows and why it matters\n\n\`\`\`text\nTODO: command ${n}\n\`\`\``).join('\n\n')}`;
  }
  if (heading === 'Automation scripts') {
    return `## ${heading}\n\n### TODO: script_name.py\n\n\`\`\`python\n#!/usr/bin/env python3\n"""TODO: what this script automates."""\n\`\`\``;
  }
  if (heading === 'Lab') {
    return `## ${heading}\n\n**Objective:** TODO: what the reader will prove by doing this.\n\n### Steps\n\n${
      Array.from({ length: 10 }, (_, i) => `${i + 1}. TODO: step ${i + 1}.`).join('\n')
    }\n\n### Validation\n\n${
      Array.from({ length: 5 }, () => '- TODO: evidence the reader can point at, not an activity they performed.').join('\n')
    }`;
  }
  if (heading === 'Operational automation') {
    return `## ${heading}\n\n### TODO: automating this in production\n\n${
      Array.from({ length: 6 }, () => '- **TODO: the practice.** TODO: why it matters and what breaks without it.').join('\n')
    }`;
  }
  if (heading === 'Troubleshooting') {
    return `## ${heading}\n\n${[1, 2, 3, 4, 5].map((n) =>
      `### Scenario ${n}: TODO: the symptom as an operator would describe it.\n\n**Likely cause:** TODO.\n\n**Resolution:** TODO: the fix, and how to confirm the diagnosis before applying it.`).join('\n\n')}`;
  }
  if (heading === 'Interview questions') {
    return `## ${heading}\n\n${[1, 2, 3, 4].map((n) =>
      `### ${n}. TODO: the question.\n\nTODO: a practitioner's answer of roughly 180 words - reasoning and trade-offs, not a definition.`).join('\n\n')}`;
  }
  return `## ${heading}\n\n${todo}`;
}).join('\n\n');

fs.mkdirSync(path.dirname(leafPath), { recursive: true });
fs.writeFileSync(leafPath,
`---
id: '${args.id}'
title: '${args.title.replace(/'/g, "''")}'
level: '${args.level}'
forest: 'AI & Intelligent Systems'
tree: '${args.tree}'
branch: '${args.branch}'
---

# ${args.title}

**Level:** ${args.level}
**Tree:** [${args.tree}](../README.md)
**Branch:** [${args.branch}](README.md)
**Forest:** [AI & Intelligent Systems](../../../README.md)

${body}

---

> Validate commands, versions, permissions, licensing, and rollback procedures in an isolated lab before production use.
`);

// Insert after the last leaf of the same branch so catalog order stays grouped.
const lastSibling = catalog.leaves.lastIndexOf(siblings[siblings.length - 1]);
catalog.leaves.splice(lastSibling + 1, 0, {
  id: args.id, name: args.title, level: args.level,
  tree: args.tree, branch: args.branch, path: leafPath,
});

recount(catalog);
writeCatalog(catalog);
regenerate(catalog);

console.log(`Created ${leafPath}`);
console.log(`Catalog now holds ${catalog.leaves.length} leaves across ${catalog.treeCount} trees and ${catalog.branchCount} branches.`);
console.log('Navigation regenerated. Replace the TODO markers, then run: npm run validate');
