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
Certification alignment, and References. Match that depth rather than the
headings alone.

Existing leaves run 2,600-3,500 words, clustering around 2,950 — counting body
text with frontmatter stripped and fenced code included. Read that as a symptom
of covering ten sections properly, not as a target: a section padded to reach a
floor, or cut to duck a ceiling, is worse than an honest count outside the band.
It is deliberately not enforced by any check, because a word-count gate rewards
exactly that padding. `npm run words` prints the current distribution, and
`npm run words -- --all` lists every leaf, so the band above can be re-derived
rather than trusted.

The Beginner leaves are the longest, not the shortest — around 3,300 words
against roughly 2,900 for Advanced. A reader without the vocabulary needs it built
before a point can land; an Advanced reader already has it and wants the
trade-off. Write to the level, and expect an introductory leaf to cost more
words than an expert one, not fewer.

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
run.bat site
```

It checks that Node is present and recent enough, installs dependencies from the
lockfile on first use, and walks you through scaffolding a leaf by picking the
tree and branch from the catalog rather than typing them. It runs the same
checks in the same order as CI and exits non-zero on the first failure, so it
also works unattended — `run.bat help` prints the `schtasks` line.

The npm scripts remain the source of truth; `run.bat` is a convenience over
them, not a second implementation.

## The website

The site is generated, not authored. `npm run build:site` reads `data/catalog.json`
and the markdown it points at, and writes static HTML to `site/`:

```bash
npm run build:site   # write site/
npm run serve:site   # serve it at http://localhost:4173
```

On Windows, `run.bat site` does both and opens your browser.

Navigation, breadcrumbs, level badges and the search index are all derived from the
catalog, so the site cannot disagree with it — there is no second copy of the taxonomy
to keep in step. Page bodies are the leaf markdown rendered to HTML, with links to
`.md` files rewritten to their generated pages.

`site/` is not committed. CI builds it on every pull request, so a structural break
fails the build, and publishes it to GitHub Pages on merge to `main`.

Publishing requires Pages to be enabled once, under Settings → Pages → Source:
**GitHub Actions**. The workflow cannot do this for you: the token it runs with may
deploy to an enabled Pages site but not create one.

Do not hand-edit anything under `site/` — the next build overwrites it. To change how
the site looks, edit `scripts/lib/site-assets.mjs`; to change what it contains, edit
`scripts/build-site.mjs`.
