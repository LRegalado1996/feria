# Agent tooling

Where skills, editor hooks and harness configuration live, and how to change them.

## Rules outrank skills and plugins

- `AGENTS.md` and the `docs/agents/` files it points to are the authority. When a skill or a plugin (the team's or your own) disagrees with them, the rules win. A plugin that argues for less code is not a licence to skip tests, e2e coverage or error handling.
- Behaviour that must hold in every session is a rule in `AGENTS.md` or a hook, never a skill. A harness loads a skill only when its description matches the task, so a skill cannot guarantee it always applies. Instead, `AGENTS.md` names each skill where it applies.
- Don't run `ultracite init`. It writes its generated rules block back into `AGENTS.md` and recreates the Cursor and Copilot rule files this repo deleted; the linter config already enforces those rules.

## Skills

Every skill lives once, in `.agents/skills/<name>/`, where Codex and Cursor read it. `.claude/skills/<name>` is a relative symlink into it for Claude Code. There is no `.cursor/skills`: Cursor also reads `.agents/skills` and `.claude/skills`.

| Skill                         | Use it to                                                                            | Source                      |
| ----------------------------- | ------------------------------------------------------------------------------------ | --------------------------- |
| `agent-browser`               | drive the running app by hand (§ Live testing)                                       | `vercel-labs/agent-browser` |
| `analyze-logs`                | read the local wide events in `.evlog/logs/` while debugging                         | `hugorcd/evlog`             |
| `conventional-commits`        | write a commit message or a PR title: the one source for types, scopes and footers   | this repo                   |
| `create-pr`                   | open a PR against `qa` that follows the PR template                                  | this repo                   |
| `design-feedback`             | turn recurring UI review feedback into a design.md rule, a primitive or a ratchet    | this repo                   |
| `frontend-design`             | set an aesthetic direction for new UI                                                | `anthropics/skills`         |
| `gh-stack`                    | split dependent work into stacked PRs (needs `gh extension install github/gh-stack`) | `github/gh-stack`           |
| `git-commit`                  | stage and create a commit; the message follows `conventional-commits`                | this repo                   |
| `git-rebase`                  | rebase a branch onto the latest base                                                 | this repo                   |
| `orpc`                        | write or review oRPC procedures, clients and tests                                   | this repo                   |
| `review-logging-patterns`     | review logging code against evlog's wide-event patterns                              | `hugorcd/evlog`             |
| `review-loop`                 | review a change locally before its PR, then argue it out with CodeRabbit on the PR   | this repo                   |
| `slack-reporting`             | report tickets, PRs and deployments to Lucas's Slack channels                        | this repo                   |
| `vercel-composition-patterns` | design component APIs                                                                | `vercel-labs/agent-skills`  |
| `vercel-react-best-practices` | review React and Next.js performance                                                 | `vercel-labs/agent-skills`  |
| `web-design-guidelines`       | review UI against Vercel's interface guidelines                                      | `vercel-labs/agent-skills`  |
| `worktree-env`                | run, pause and diagnose this worktree's Postgres and app                             | this repo                   |

### Adding or refreshing a skill

`skills-lock.json` records each registry skill: where it came from (`source`, `skillPath`) and the hash the CLI recorded for it (`computedHash`). Skills from "this repo" are not in the lock; edit them by hand.

- Use the pinned CLI, never a bare `skills`: `pnpm dlx skills@1.5.20 add <owner/repo> --skill <name> -a claude-code -y` adds one, `pnpm dlx skills@1.5.20 update <name> -p -y` refreshes one. Bump the pin on purpose, in its own PR.
- One skill per PR, so the diff stays reviewable. Re-apply the local deviations below in the same PR.
- After the CLI runs, delete any agent directory it created that this repo doesn't use (it writes one per agent it detects), make sure `.claude/skills/<name>` is a relative symlink into `.agents/skills/`, and check that `find -L .claude/skills -type l` prints nothing (it lists dangling links, on macOS and Linux alike).
- No scheduled refresh. Unattended refreshes produce PRs too large to review, silently undo local deviations, and run a third-party CLI with write access to the repo.

Local deviations from upstream (a refresh undoes them):

- `vercel-composition-patterns` and `vercel-react-best-practices` ship without upstream's compiled `AGENTS.md` (every rule in one large file), `README.md`, `metadata.json` and `rules/_*.md`, and without the `SKILL.md` pointer to the compiled file, so an agent loads one rule file at a time.
- `git-commit` started as `github/awesome-copilot`'s skill and is now this repo's: it keeps the staging and safety steps and takes the message format from `conventional-commits`. It is out of the lock; do not refresh it.
- Their lock entries, and `web-design-guidelines`', were recorded from the copies committed here when the lock was introduced, so those hashes describe this repo's files rather than an upstream release.

## Editor hooks

- Claude Code (`.claude/settings.json`, `PostToolUse` on `Write|Edit`) and Cursor (`.cursor/hooks.json`, `afterFileEdit`) both run `scripts/format-edited-file.sh` after every edit. It reads the edited path from the hook's JSON on stdin and runs the pinned `ultracite fix` on that one file: syntax-only lint and format, about a second.
- It exits 0 when there is nothing to do (an unsupported file type, no `node_modules` yet) and 1, never 2, on a lint error it can't fix, so a diagnostic is feedback rather than a blocked edit. `bash scripts/format-edited-file.sh --self-test` covers both payload shapes.
- The commit and push hooks and CI are the gate, not the editor hook (`docs/agents/ci.md`).
- No plugins are enabled from `.claude/settings.json`. Personal plugins are fine; § Rules outrank skills and plugins applies to them too.

## Which harness reads what

| Harness        | Instructions                                                                                                     | Skills                               | Config                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------- |
| Claude Code    | `CLAUDE.md` (symlink to `AGENTS.md`); a nested `CLAUDE.md` loads when it works in that directory                 | `.claude/skills/`                    | `.claude/settings.json`                |
| Codex          | `AGENTS.md` files from the repo root down to the working directory, up to 32 KiB in total by default             | `.agents/skills/`                    | `~/.codex/config.toml` (per developer) |
| Cursor         | `AGENTS.md`, root and nested                                                                                     | `.agents/skills/`, `.claude/skills/` | `.cursor/hooks.json`                   |
| GitHub Copilot | coding agent and code review: `AGENTS.md`; IDE chat: `.github/copilot-instructions.md`, a pointer to `AGENTS.md` | none                                 | none                                   |

- Keep the root `AGENTS.md` small: every session loads it, and Codex stops reading at its byte budget. Depth goes in `docs/agents/`, behind the pointer table.
- A nested `AGENTS.md` gets a sibling `CLAUDE.md` symlink (`ln -s AGENTS.md CLAUDE.md`) and a row in the root pointer table. The root pointer is the only route every harness follows.
- `.mcp.json` lists remote HTTP MCP servers only (today: Sentry and Vercel), with no credentials: each developer signs in through OAuth on first use. Only Claude Code reads it, and not in cloud sessions, which use claude.ai connectors instead. Other harnesses configure MCP servers in their own client config. Add a server here only when the project uses the service.
- Harnesses that wrap these agents read whatever the wrapped agent reads. Their worktree hooks all call the same `pnpm wt:*` entry points (the `worktree-env` skill), so no harness boots containers by itself:

| Harness  | File                    | On create           | Run           | On settle / archive                                                    |
| -------- | ----------------------- | ------------------- | ------------- | ---------------------------------------------------------------------- |
| T3 Code  | `t3.json`               | `pnpm wt:provision` | `pnpm wt:dev` | settle: `pnpm wt:pause` (T3 has no delete hook; `pnpm wt:gc` reclaims) |
| Orca     | `orca.yaml`             | `pnpm wt:provision` | none          | archive: `pnpm wt:down --volumes`                                      |
| Superset | `.superset/config.json` | `pnpm wt:provision` | `pnpm wt:dev` | teardown: `pnpm wt:down --volumes`                                     |

Claude Code cloud sessions provision through a `SessionStart` hook in `.claude/settings.json` (`scripts/cloud-session-start.sh`), which exits at once anywhere else. Environment setup and troubleshooting: `docs/agents/cloud-sessions.md`.

## Live testing

`agent-browser` drives a real Chromium against the running app, to verify a change by hand, reproduce a bug or take a screenshot. It is a global CLI, not a project dependency. Its commands are never committed, and it never replaces Playwright e2e coverage.

- Point it at this worktree's app (`pnpm dev`, URL from `pnpm wt:ports`) or at the branch's preview deployment, never at a fixed `localhost:3000`. Stop the app when you are done (the `worktree-env` skill).
- Loop: `agent-browser open <url>`, then `agent-browser snapshot -i` for element refs, act on a ref (`click @e3`, `fill @e1 "…"`), and snapshot again after every page change, because refs go stale.
- Reuse the app's `data-testid`s: `agent-browser find testid "<id>" click`.
- The app is behind Better Auth. Sign in through the snapshot loop or the CLI's auth vault (`auth save … --password-stdin`); never pass credentials as command-line arguments.
- `agent-browser skills get core` prints the guide that matches the installed version.
