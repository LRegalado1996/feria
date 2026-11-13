# Claude Code cloud sessions

A cloud session (claude.ai/code, the Claude app, `claude --cloud`) runs on a fresh Anthropic-hosted Ubuntu VM with Docker installed. Once the environment below is configured, the commands in `AGENTS.md` work there as they do locally: `pnpm dev`, `pnpm test:integration`, `pnpm e2e:ci`, `pnpm verify:ci`.

Two halves make it work. The **cloud environment** is configured once in claude.ai and lives outside this repository. The **repository** carries `scripts/cloud-session-setup.sh` (provisions the VM) and `scripts/cloud-session-start.sh` (provisions the checkout; the `SessionStart` hook in `.claude/settings.json` runs it).

## Configure the cloud environment (once)

Prefer an organization-shared environment so every member gets the same one.

**Network access.** Choose **Custom**, check **Also include default list of common package managers**, and allow:

| Host                                                           | Why                                                                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `cdn.playwright.dev`, `playwright.download.prss.microsoft.com` | Playwright's browser downloads. Without them neither e2e nor agent-browser has a browser.                                              |
| `dl-cdn.alpinelinux.org`                                       | Only for the app container (`pnpm wt:app`): its entrypoint runs `apk add` on every start. `pnpm dev` on the VM itself doesn't need it. |

Docker Hub, npm and nodejs.org are already in the default list.

**Environment variables.**

```text
BASH_MAX_TIMEOUT_MS=3600000
```

A command Claude runs is otherwise capped at 10 minutes, which a full `verify:ci` exceeds. Add nothing secret: anyone using the environment can read its variables, and the dev stack needs none (every value is generated or a local default).

**Setup script.**

```bash
#!/bin/bash
for script in /home/user/*/scripts/cloud-session-setup.sh; do bash "$script"; done
exit 0
```

It runs from `/home/user`, before Claude Code starts, with the clone at `/home/user/<repo>`, so a relative path or `$CLAUDE_PROJECT_DIR` does not work there. It installs the `.nvmrc` Node and the `packageManager` pnpm, pulls the images the compose files pin, installs Playwright's Chromium with its system libraries in `/opt/ms-playwright`, agent-browser, gitleaks (the pre-commit hook needs it) and shellcheck. Anthropic snapshots the result and reuses it for later sessions, but only when the script finishes in about five minutes; it logs its own duration.

## What happens when a session starts

`scripts/cloud-session-start.sh` exits at once outside a cloud session. Inside one, on every start, resume and compaction, it:

1. **Fixes the session environment** through `$CLAUDE_ENV_FILE`, which Claude Code sources before every command. It unsets `CI` and `NODE_ENV`, which the cloud exports as `true` and `production`: with them every `wt ensure` silently does nothing and `pnpm install` skips devDependencies. It also puts the `.nvmrc` Node first on `PATH` and points Playwright and agent-browser at `/opt/ms-playwright`.
2. **Starts dockerd.** It dies with the VM whenever a session idles; images and the database volume survive on disk.
3. **Provisions the checkout, first session only**, in the background: `wt provision` then `wt ensure` (`.env`, `node_modules`, Postgres, migrate, seed). The hook prints the log path (`.wt/cloud-session-provision.log`), the ready marker (`.wt/cloud-session-ready`, created only on success) and a wait loop that ends on success or on `FAILED at`.

It does not start the app. Run `pnpm dev` in the background when a task needs it.

## Working in a session

- **Ports.** A cloud clone is a main checkout, so the stack uses the base ports: app 13000, Postgres 15432. `pnpm wt:ports` confirms.
- **Try the app.** `pnpm dev` in the background, then drive `http://localhost:13000` with agent-browser (`docs/agents/agent-tooling.md` § Live testing). Nothing in the session is reachable from outside: a person sees the change through a preview deployment, or pulls the session to a laptop with `claude --teleport`.
- **Long runs.** Run `pnpm verify:ci` and multi-spec e2e in the background; prefer `pnpm e2e:ci <spec>` while iterating.
- **One checkout per VM.** Parallel work means parallel sessions, not worktrees inside one VM.

## Not available in a cloud session

- **Plugins and personal config.** Nothing from a personal `~/.claude` comes along.
- **`.mcp.json` servers.** They need an interactive OAuth sign-in. Use the equivalent claude.ai connectors.
- **Some GitHub calls.** Requests go through Anthropic's proxy, which serves a pinned set of pull-request operations. Expect others, `gh stack` among them, to get a 403; run stacks locally.

## Troubleshooting

| Symptom                                        | Look at                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker is not running`                        | `.wt/dockerd.log`, then `pnpm cloud:provision`                                                                                                                                                                      |
| The wait loop ends on `FAILED at`              | `.wt/cloud-session-provision.log`; fix the cause, then `pnpm cloud:provision`                                                                                                                                       |
| A Postgres or Node image pull fails with `429` | Docker Hub's anonymous rate limit on the shared egress IP. Pull `public.ecr.aws/docker/library/<image>`, `docker tag` it to the Docker Hub name, then `pnpm wt ensure`                                              |
| The app container exits with `apk` errors      | `dl-cdn.alpinelinux.org` is missing from the allowed hosts, or `apk` says `certificate not trusted`: `NODE_EXTRA_CA_CERTS` must name a readable file so `scripts/worktree.sh` layers `docker-compose.proxy-ca.yaml` |
| `gitleaks: command not found` on commit        | The setup script did not complete; check its log in the session's setup step. Never `--no-verify`.                                                                                                                  |
| Every session takes minutes to start           | The setup script exceeds the cache budget; trim it                                                                                                                                                                  |

## Verify an environment

After changing the environment, open a fresh session and run:

```bash
env | grep -E '^(CI|NODE_ENV)='     # prints nothing
node --version                      # matches .nvmrc
command -v gitleaks agent-browser   # both found
until [ -f .wt/cloud-session-ready ] || grep -q 'FAILED at' .wt/cloud-session-provision.log 2>/dev/null; do sleep 5; done
pnpm test:integration
pnpm e2e:ci <one spec under src/e2e/tests>
```
