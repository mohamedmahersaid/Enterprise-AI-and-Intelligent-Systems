# Contributing

Contributions should improve technical accuracy, safety, version clarity, evidence quality, or operational usefulness.

## Requirements

- Use fictional names and sanitized examples.
- State product versions, prerequisites, permissions, risk, and rollback implications.
- Preserve stable forest, tree, branch, and leaf IDs.
- Validate commands and automation in an isolated lab.
- Run `npm run validate` before submitting a pull request.

Never include real credentials, internal URLs, customer data, private reports, or employer-confidential information.

## Adding a leaf

`data/catalog.json` is the source of truth. `CATALOG.md`, `README.md` and every
tree and branch README are derived from it, and CI asserts they agree — so do
not edit them by hand. Scaffold the leaf instead:

```bash
npm install
npm run new-leaf -- \
  --id ai-example-leaf \
  --title "Example Leaf: What It Covers" \
  --level Intermediate \
  --tree "AI Platform Engineering" \
  --branch "Model and Feature Lifecycle"
```

This writes a leaf that already satisfies the structural rules, adds it to the
catalog, and regenerates all navigation. Run it with no arguments to see the
valid trees, branches and levels.

Then replace every `TODO:` marker with content. Validation fails while any
remain, so an unfinished scaffold cannot merge.

Each leaf carries ten sections: Explanation, Architecture and flow (a mermaid
diagram), Commands, Automation scripts, Lab (with validation criteria stating
evidence rather than activity), Operational automation, Troubleshooting (five
scenarios, each with cause and resolution), Interview questions (four, answered
as a practitioner would in an interview rather than as definitions),
Certification alignment, and References. Existing leaves run roughly 2,700-3,300
words; match that depth rather than the headings alone.

If you edit `data/catalog.json` directly — renaming a branch, changing a level —
run `npm run regen` to rewrite the derived files, rather than editing them.

## Checks

| Command | What it enforces |
| --- | --- |
| `npm run validate:content` | Heading hierarchy, required sections, frontmatter and catalog agreement, catalog self-consistency, unresolved TODOs, link resolution, CATALOG.md coverage, README figures |
| `npm run validate:mermaid` | Every mermaid diagram parses |
| `npm run lint:md` | Markdown style |
| `npm run validate` | All three, in order |

## On Windows

`run.bat` in the repository root wraps the same npm scripts. Double-click it for
a menu, or name a target from a shell:

```bat
run.bat validate
run.bat new-leaf
```

It checks that Node is present and recent enough, installs dependencies from the
lockfile on first use, and walks you through scaffolding a leaf by picking the
tree and branch from the catalog rather than typing them. It runs the same
checks in the same order as CI and exits non-zero on the first failure, so it
also works unattended — `run.bat help` prints the `schtasks` line.

The npm scripts remain the source of truth; `run.bat` is a convenience over
them, not a second implementation.
