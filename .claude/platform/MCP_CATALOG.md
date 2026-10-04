# MCP Catalog

Every MCP server considered for this repository, scored on the criteria the
platform uses: capability, necessity, duplication, token cost, reliability,
security, performance, maintenance and value. Token cost is the standing cost of
the tool names and server instructions; with deferred tool loading, full schemas
load only when a tool is first used.

## Configured (account connectors; nothing in `.mcp.json`)

| Server | Tier | Capability | Duplication | Token cost | Security | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| GitHub | 1 Core | PRs, Actions runs and logs, reviews | None (`gh api` cannot fetch logs here) | 56 tools | OAuth, repo-scoped by the platform; has write tools | **Keep** |
| Claude Code Remote | 1 Core | PR subscriptions, check-ins, sessions | None | 24 tools | Platform-managed | **Keep** (platform) |
| Microsoft Learn | 2 Dev | Official Microsoft/Azure docs and samples | None | 3 tools | Read-only, no credential | **Keep** |
| Claude Docs | 4 Specialized | Shared documents | None | 8 tools | Account-scoped write | Optional (only when a doc is asked for) |
| Gmail | 3 Enterprise | Mail | n/a | 30 tools | Mailbox read/write | **Disable for coding sessions** |
| Google Drive | 3 Enterprise | Files | n/a | 11 tools | Drive read/write | **Disable for coding sessions** |
| Gamma | 4 Specialized | Presentations | Overlaps account pptx skill | 20 tools | Account write | **Disable for coding sessions** |
| Spotify | n/a | Music | n/a | 5 tools | Account write | **Disable** |
| Canva | 4 Specialized | Design | n/a | needs authorization | n/a | **Remove or leave unauthorized** |

Disabling the four non-development connectors removes 66 of about 159 attached
tools (about 42%) and three server instruction blocks from every session. It is
an account setting, so only the owner can change it.

## Candidates evaluated and not installed

| Candidate | Capability | Why not | Decision |
| --- | --- | --- | --- |
| Filesystem MCP | File read/write | Duplicates built-in Read/Edit/Glob/Grep | **Reject** |
| Git MCP | Git operations | Duplicates `git` via Bash, with weaker permission rules | **Reject** |
| Second GitHub server (local) | GitHub API | Duplicates the connector; would need a PAT in the container | **Reject** |
| Terminal/shell MCP | Command execution | Duplicates Bash | **Reject** |
| Fetch/web MCP | HTTP fetch | Duplicates WebFetch; the egress proxy limits both | **Reject** |
| Playwright/browser MCP | Browser automation | `check-site.mjs` + jsdom already test the site; about 20 extra tools | **Defer** (revisit for visual site checks) |
| Azure MCP Server | Azure resource operations | No Azure subscription or credentials approved (Phase 12) | **Defer** until the Azure lane is approved |
| Kubernetes / Terraform / Docker MCP | Cluster and IaC operations | No cluster, no Terraform state, Docker daemon absent | **Reject** for this repo |
| Jira / Confluence / ServiceNow / Slack / Teams / M365 | Enterprise collaboration | No such system is used by this repository | **Reject** for this repo |
| Database MCP (Postgres, etc.) | SQL access | No database in this repository | **Reject** |
| Context7-style library docs | Third-party docs | Leaves must cite primary vendor pages; registry JSON covers versions | **Reject** |

## Adding a server later

1. Name the capability gap and the task it unblocks.
2. Confirm no built-in tool, connector or skill already covers it.
3. Prefer the vendor's official server; read its permission model.
4. Prefer an account connector (OAuth, no secret in the repo). If a project
   server is unavoidable, put it in `.mcp.json` with `${VAR}` references only;
   credentials go in the environment's secrets, never in the file.
5. Add `ask` rules for its write and destructive tools in `.claude/settings.json`.
6. Record it here, in [MCP_SECURITY.md](MCP_SECURITY.md) and in the changelog.
