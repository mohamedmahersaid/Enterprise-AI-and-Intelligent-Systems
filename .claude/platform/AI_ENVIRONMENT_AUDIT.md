# AI Environment Audit

Read-only audit of the Claude Code environment this repository is worked on,
taken 2026-10-04 before any change. Values of environment variables and
credentials were never read or printed; only names were listed.

## Where Claude Code runs

This repository is worked on in **Claude Code on the web**: an ephemeral cloud
container, cloned fresh per session and reclaimed after inactivity. That one
fact drives the whole design, because anything installed or configured only
inside the container is lost:

| Layer | Survives a new session? | Who changes it |
| --- | --- | --- |
| Files committed to this repo (`CLAUDE.md`, `.claude/`, `.mcp.json`) | Yes | Pull request |
| Account connectors (claude.ai Settings > Connectors) | Yes | Owner, in the browser |
| Account skills (claude.ai Settings > Skills; synced into `~/.claude/skills/synced`) | Yes | Owner, in the browser |
| Cloud environment setup script and network policy | Yes | Owner, environment settings |
| `~/.claude/` in the container, `apt`/`pip`/`go` installs | **No** | Lost on restart |

There is no Claude Desktop here, so Desktop's `claude_desktop_config.json` is
out of scope. A container restart during this audit confirmed that background
work and session-local installs do not persist.

## Operating system and runtimes

| Item | Found |
| --- | --- |
| OS | Ubuntu 24.04.4 LTS, Linux 6.18, x86_64, 4 vCPU, 15 GiB RAM |
| Shell | bash |
| Claude Code | 2.1.286 at audit; 2.1.289 after a container restart the same day (`/opt/node22/bin/claude`) |
| Node.js / npm / npx | 22.22.2 / 10.9.7 (repo CI pins Node 22) |
| pnpm / yarn / bun | 10.33.0 / 1.22.22 / 1.3.11 (unused by this repo) |
| Python | 3.11.15 default; 3.12.3 at `/usr/bin/python3.12` |
| uv | 0.8.17 |
| Git | 2.43.0 |
| Docker | 29.3.1 CLI; **daemon not reachable** |
| Java / Go / Rust | present (JDK, Go 1.24.7, Rust 1.94.1); unused by this repo |
| jq / ripgrep / make / gcc | present |

**Runner parity gap:** CI uses Python 3.12 and several leaf pins (numpy 2.5.x)
need it, while the container default is 3.11. `validate:scripts` therefore
needs `python3` resolving to 3.12. The previous sessions used a temporary
`PATH` shim to do this.

## CLIs

| Present | Missing |
| --- | --- |
| `git`, `docker` (CLI only), `jq`, `yq` (stub 0.0.0), `rg`, `uv`, `claude` | `gh` (a built-in `gh api` proxy client is available instead), `az`, `aws`, `gcloud`, `oci`, `kubectl`, `helm`, `terraform`, `tofu`, `ansible`, `pwsh`, `dotnet`, `podman`, `shellcheck`, `actionlint`, `gitleaks`, `semgrep`, `pipx`, `fd` |

None of the missing cloud CLIs is needed by the offline gates. `az` becomes
relevant only when the owner-gated Azure live lane (Phase 12) is approved.

## Network egress (through the agent proxy)

| Destination | Result |
| --- | --- |
| registry.npmjs.org, pypi.org, api.github.com, releases.hashicorp.com, dl.k8s.io, proxy.golang.org | reachable |
| github.com web, `*.github.io`, Actions artifact blob host, learn.microsoft.com, aka.ms | blocked or denied by policy |
| GitHub REST paths for Pages, environments and variables | denied by the proxy |

The blocked GitHub paths are why live-run evidence is transcribed from job
logs, and why Pages settings cannot be inspected from a session.

## Claude Code configuration found

| Item | State |
| --- | --- |
| `CLAUDE.md` (repo, user) | absent |
| `.claude/` in repo | absent |
| `.mcp.json` | absent |
| `~/.claude/settings.json` | absent (the platform injects launcher settings with one `Stop` hook) |
| Project MCP servers in `~/.claude.json` | none |
| User agents / commands | none |
| User skills | `session-start-hook` (platform) |
| Account-synced skills | 16 Anthropic skills (docx, pdf, pptx, xlsx, skill-creator, mcp-builder, ...) |
| Built-in skills | `code-review`, `security-review`, `simplify`, `init`, `run`, `loop`, `fewer-permission-prompts`, `update-config`, ... |

## Connected MCP servers (account connectors and platform)

| Server | Tools | Relevance to this repo |
| --- | --- | --- |
| GitHub | 56 | Core: PRs, Actions, logs |
| Claude Code Remote | 24 | Platform: sessions, PR subscriptions, check-ins |
| Microsoft Learn | 3 | High: grounding Azure/Microsoft claims in leaves |
| Claude Docs | 8 | Low: only when asked for a doc |
| Gmail | 30 | None for development |
| Gamma | 20 | None for development |
| Google Drive | 11 | None for development |
| Spotify | 5 | None |
| Canva | needs authorization | None; not authorized |

About 159 MCP tools are attached, and 66 of them (about 42%) belong to
servers with no development use here. Their schemas are deferred, so the
standing cost is the tool names plus each server's instruction block, not full
schemas. That overhead is still paid in every session.

## Repository facts relevant to Claude

- 171 tracked files; `docs/` (72) is the curriculum, `scripts/` and `test/`
  are the validators, `data/` is the source of truth.
- Large paths that should never be read wholesale: `node_modules/` (195 MB),
  `site/` (generated, 7.7 MB), `.git/` (187 MB of loose objects, unpacked),
  `package-lock.json` (236 packages).
- Derived files: `PATHS.md`, `READINESS.md`, `ASSUMPTIONS.md` and every
  branch `README.md` are generated whole; `CATALOG.md`, the tree READMEs and
  `README.md` keep hand-written prose and only their lists and figures are
  generated. `npm run regen` rewrites them and `validate:regen` fails CI on
  drift.
- Gates: `npm test` (166 tests) and `npm run validate`; GitHub Actions also run
  `verify-validation`, live legs, currency and Ollama-tag checks.
- `actionlint` 1.7.7 with shellcheck 0.10.0 (installed for this audit only)
  reports all six workflows clean apart from one intentional info-level note
  (SC2016, a literal backtick in `pages.yml`).

## Secrets

- **Tracked files:** the only credential-format matches are deliberate
  synthetic fixtures in `test/commands.test.mjs`, which test the credential
  scanner itself. The history matches (6 lines) are the same fixtures.
  Nothing real was found.
- **Environment:** the platform injects credential-bearing variables
  (`GH_TOKEN`, `GITHUB_TOKEN`, `AWS_*`, `CLOUDSDK_AUTH_ACCESS_TOKEN`, session
  tokens). They are the platform's and must never be echoed, logged or copied
  into files; their values were not read.
- `validate:commands` already blocks known credential formats in leaves.

## Duplicates, conflicts and gaps

| Finding | Impact |
| --- | --- |
| Filesystem and Git MCP servers would duplicate built-in Read/Edit/Bash | Reject both |
| A custom `/review` or `/security-review` would duplicate built-in skills | Do not create |
| Four connectors irrelevant to development are attached | Context overhead every session |
| No `CLAUDE.md`: each session re-derives repo rules from CONTRIBUTING (379 lines) | Repeated reading |
| No guard on derived files | Hand edits fail CI late |
| Python 3.12 parity is manual | `validate:scripts` differs from CI |
| Live-run recording and PR drive steps live only in chat history | Repeated, error-prone procedure |

## Recommended architecture

See [AI_PLATFORM_ARCHITECTURE.md](AI_PLATFORM_ARCHITECTURE.md).
