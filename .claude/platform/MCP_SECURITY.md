# MCP Security

Access each attached MCP server has, split into read, write and destructive
operations, and how this repository constrains them. Permission rules live in
`.claude/settings.json`.

## GitHub (account connector)

| Item | Detail |
| --- | --- |
| Auth | OAuth via the claude.ai GitHub connector; the platform scopes the session to the repositories it attached |
| Filesystem / network | None locally; calls api.github.com |
| Read | `pull_request_read`, `get_job_logs`, `actions_list`, `actions_get`, `get_check_run`, search and list tools (allowed without prompting) |
| Write | `create_pull_request`, `update_pull_request`, comments, reviews, `push_files`, `create_or_update_file`, `create_branch`, `actions_run_trigger` |
| Destructive | `merge_pull_request`, `delete_file`, `create_repository`, `fork_repository` (all **ask**) |
| Trust | High (first-party connector) |
| Usage | Prefer read tools; writes only on the session branch and its PR |

## Claude Code Remote (platform)

| Item | Detail |
| --- | --- |
| Auth | Platform session |
| Read | `get_session`, `list_*`, `get_trigger`, `read_documentation` |
| Write | `send_later`, `create_trigger`, `subscribe_pr_activity`, session titles and tags |
| Destructive | `delete_trigger`, `archive_session` |
| Usage | Check-ins only for PRs this session owns; delete them once the PR closes |

## Microsoft Learn (account connector)

Read-only documentation search, fetch and code samples. No credential, no write
or destructive operations. Allowed without prompting.

## Claude Docs, Gmail, Google Drive, Gamma, Spotify (account connectors)

All can write to the owner's accounts (send mail, edit files, create
documents). None is needed for development; the recommendation is to disable
them for coding sessions ([MCP_CATALOG.md](MCP_CATALOG.md)). Until then, use
them only when the user explicitly asks for that service.

## Built-in tools: repository rules

| Category | Rule |
| --- | --- |
| Never read | `node_modules/`, `.venv/`, `.git/`, `.env`, `.env.*` (`deny`). `site/` is deliberately readable: denying it also blocks shell inspection of build output |
| Never run | `git push --force` / `-f` in any position, `npm publish` (`deny`) |
| Confirm first | `git reset --hard`, `git clean`, `git branch -D` (`ask`) |
| Allowed | `npm test`, `npm run *`, `npm ci`, `node scripts/*`, read-only git, the health check |
| Blocked by hook | Edits to wholly generated files (`guard-derived.mjs`, exit 2) |

Operations needing explicit confirmation regardless of mode: delete, destroy,
drop, reset, force-push, production change, credential rotation and
infrastructure decommission. The repository has no production infrastructure;
the only "production" surface is `main` and the Pages site, both reached only
through reviewed PRs.

## Secrets

- The platform injects credential-bearing environment variables (`GH_TOKEN`,
  `GITHUB_TOKEN`, `AWS_*`, `CLOUDSDK_AUTH_ACCESS_TOKEN`, session tokens). Never
  echo, log, write or paste them; refer to them only by name.
- Nothing in `CLAUDE.md`, skills, agents, rules, hooks or these documents
  contains a credential. `validate:commands` blocks credential formats in leaves,
  and the health check fails if a key, certificate or `.env` file is tracked.
- Workflows: secrets never in jobs that run repository code; values reach shell
  via `env:`; public logs never receive `toJSON(vars)` or secret material.
- A future project MCP server takes credentials from the environment's secret
  settings through `${VAR}` expansion, never a literal in `.mcp.json`.
