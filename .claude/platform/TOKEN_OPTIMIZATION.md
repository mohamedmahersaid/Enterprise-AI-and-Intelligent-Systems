# Token Optimization

Rules and mechanisms that keep context small in this repository. Measured
numbers are in [AI_PLATFORM_BASELINE.md](AI_PLATFORM_BASELINE.md).

## Mechanisms in place

| Mechanism | Effect |
| --- | --- |
| `CLAUDE.md` kept to ~50 lines | ~590 tokens standing, instead of ~5,900 to re-read CONTRIBUTING |
| Path-scoped `.claude/rules/` | Leaf, workflow and validator rules load only when those files are touched |
| Skills, not repeated instructions | Procedures (record a run, drive a PR) load only when invoked |
| Read-only subagents | CI logs, source pages and full-leaf reads stay out of the main context; only a compact verdict returns |
| `Read` deny rules | `node_modules/`, `.venv/`, `.git/` cannot be read by file or shell read tools; `site/` stays readable for build checks, but read single pages only |
| Silent startup hook | Prints nothing on success, so adds no context |
| `check-report.mjs` | Verifies a transcription without re-reading the log into context |
| No duplicate MCP servers | No filesystem/Git/terminal servers adding tool names |

## Do

- Search before reading: `rg -n` or Grep for the symbol, then read the lines you need
  (`Read` with `offset`/`limit`).
- Fetch logs narrowly: `get_job_logs` with `tail_lines` 150-300, widen only if needed.
- Delegate wide reads (many files, long logs, web sources) to an agent and ask
  for a structured result.
- Reuse what is established: cite earlier results instead of re-deriving them.
- Pipe long command output through `tail`, `grep` or `jq` before it reaches context.
- Use JSON parsing (`node -e`, `jq`, `python3 -c`) to pull fields out of large
  files such as `data/catalog.json` or API responses.
- Prefer the gates' own output over re-checking by hand what they prove.

## Do not

- Read `package-lock.json`, generated files or whole leaves when a section will do.
- Dump `git log -p`, full CI logs or full API listings (`actions_list` without
  `perPage` can exceed 60k characters).
- Repeat system or project instructions back in replies or prompts to agents;
  agents get `CLAUDE.md` automatically.
- Ask an agent to rediscover what the main session already knows: pass the facts.
- Load MCP tools speculatively; search for a deferred tool only when needed.

## Owner actions that reduce context further

1. Disable the Gmail, Google Drive, Gamma and Spotify connectors for coding
   sessions (removes 66 tool names and three instruction blocks per session).
2. Remove or leave unauthorized the Canva connector.

## Review loop

After meaningful work, note in the PR or changelog: what was repeated (candidate
skill), what flooded context (candidate agent or narrower command), and what
tool went unused (candidate for removal). Change configuration only from
observed evidence, never speculation.
