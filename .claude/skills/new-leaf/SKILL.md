---
name: new-leaf
description: Author a new curriculum leaf or substantially revise one so it passes every gate first time - scaffold, ten sections, commands, scripts, certification alignment, references, optional live-run spec. Use when asked to add, write or rewrite a leaf.
argument-hint: "<id> \"<title>\" <level> \"<tree>\" \"<branch>\""
---

# Author a leaf

Arguments: `$ARGUMENTS`. Rules: `.claude/rules/leaves.md` (loaded with any
`docs/` file) and CONTRIBUTING.md "Adding a leaf".

1. **Scaffold** - `npm run new-leaf -- --id <id> --title "<title>" --level <L> --tree "<T>" --branch "<B>" [--needs runner]`.
   Run with no arguments first if any value is unknown.
2. **Ground before writing** - collect primary sources for every version, limit
   and exam domain you will state: Microsoft Learn MCP for Microsoft/Azure, the
   vendor or project page otherwise, PyPI/npm JSON for package versions. If a
   fact cannot be verified, write "not verified" or leave it out. Delegate a
   batch of claims to the `source-verifier` agent instead of browsing inline.
3. **Write the ten sections** to the depth the gates check: one ```` ```text ````
   fence per `### Command N`, five troubleshooting scenarios with cause and
   resolution, four interview questions, a Lab `### Validation` that names evidence.
4. **Scripts** - every third-party import declared by a `pip install` in the leaf;
   each script must stop with its own message when run bare.
5. **Certification alignment** - only credentials genuinely taught; labels and
   domains copied from `data/certifications.json`; OWASP as `LLMnn:2026 Name`.
6. **Live spec (optional)** - if a stock runner or Ollama can run the commands,
   add `data/live/<id>.json` (copy a sibling spec), list the leaf and any
   fixtures dir in `live.yml` `pull_request.paths`, and keep readiness `lab`.
7. **Check** - `npm run regen && npm run validate`; then ask the `leaf-reviewer`
   agent for a review before opening the PR with `/drive-pr`.
