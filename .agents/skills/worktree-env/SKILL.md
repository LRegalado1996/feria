---
name: worktree-env
description: >-
  Manage this worktree's dev services (Postgres, plus an optional app
  container): start on demand, check status, pause, reclaim, or diagnose a
  command failing with ECONNREFUSED, "database … does not exist" or a refused
  Postgres connection. DB-needing pnpm scripts start what they need, so never
  start services preemptively, and never drive `docker compose -p feria-*`
  by hand. Unit tests, lint, typecheck and build need no services at all. Use
  `agent-browser` to drive the running app (start it here first).
---

# Worktree environment

Each git worktree owns an isolated Docker stack: `db` (Postgres, pinned to production's major.minor) and, on request, `app` (the dev server in a container). Ports derive from the worktree's path, so worktrees never collide. Nothing runs until a command needs it. Your job is almost never to manage the stack: know which tier the task needs, and diagnose honestly when something fails.

## Tool boundary

`scripts/worktree.sh` owns the stack (`pnpm wt <command>` or `pnpm wt:<command>`). Don't drive `docker compose -p feria-*` by hand: that skips port computation, `.env` generation and the ensure lock. Read-only `docker ps`, `inspect` and `logs` are fine.

Before claiming services are up, down or broken, check: `pnpm wt:doctor --json`.

## Tiers: pick the highest one the task needs, never more

| Tier | What runs          | Who needs it                                                             | How it starts                                                 |
| ---- | ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 0    | nothing            | unit tests, lint, typecheck, build, review: most sessions                | `pnpm wt:provision` (`.env` + host install; runs on worktree creation) |
| 1    | `db`               | `db:*`, `test:integration`, `e2e`, `verify:ci`/`e2e:ci`, `pnpm dev`        | automatically: those scripts run `pnpm wt ensure` first        |
| 2    | `db` + `app` container | browser checks against a containerized app                           | `pnpm wt:app`                                                 |

`pnpm dev` (same as `pnpm wt:dev`) is tier 1 plus `next dev` on the host at this worktree's app port: faster than the container, and the usual way to run the app.

## Commands

```bash
pnpm wt:provision                   # tier 0: .env + host node_modules, no docker
pnpm wt ensure [--app] [--json]     # tier 1 (idempotent, locked); --app adds tier 2
pnpm dev                            # tier 1 + host next dev on this worktree's port
pnpm wt:app                         # tier 2: app container, waits for HTTP
pnpm wt:pause [--app]               # stop containers, keep volumes; --app stops only the app
pnpm wt:down [--volumes]            # remove containers; --volumes also deletes the database
pnpm wt:gc [--yes]                  # stacks of deleted worktrees: lists, deletes only with --yes
pnpm wt:doctor [--json]             # diagnose: docker, compose, .env, toolchain, migrations, image pin
pnpm wt:ports / wt:status / wt:env / wt:logs [service]
```

- `--json` prints exactly one JSON object on stdout; progress goes to stderr.
- `ensure` is idempotent and mkdir-locked. A no-op costs well under a second, a resume from pause about a second, and a brand-new database (initdb, migrate, seed) a few seconds. Never pre-warm.
- `ensure` repairs a `.env` that points at another worktree's port, installs an empty host `node_modules`, and applies pending migrations (stamped against `src/server/db/drizzle/meta/_journal.json`, so the no-op path skips the database probe). It seeds a fresh database once.
- In CI, inside the app container, or with `SKIP_WT_ENSURE=1`, `ensure` does nothing by design. Don't "fix" that.
- `pnpm dev` refuses while the app container holds the port (`pnpm wt:pause --app` first). While it runs, `ensure --app` uses it instead of starting the container.
- Plain `pnpm e2e` reuses the server at `E2E_BASE_URL` from `.env`, so start `pnpm dev` first. `pnpm e2e:ci [spec…]` and `pnpm verify:ci` need neither: they use a `feria_verify_<worktree>` database on this Postgres (dropped on exit) and serve a production build on port 23000 + the worktree offset. `e2e:ci` reuses `.next` when it exists and prints its build time; rebuild (`pnpm build`) after changing `src/`.
- The URL is `https://<worktree>.feria.localhost` (or portless's http fallback port) only while the portless proxy runs; otherwise `http://localhost:<app port>`. `pnpm wt:ports` prints it.

## You start it, you stop it

The app container is the expensive tier (2 to 3.5 GB) and nothing stops it for you. When you started it (or `pnpm dev`) for a check and are done, run `pnpm wt:pause --app` (or stop the dev server). Leave it running only when the user asked to keep the app open.

`pnpm wt:pause` is always safe: volumes and containers survive, and the next database command resumes them. It keeps the database running while a host `pnpm dev` uses it.

**Checkpoint:** `pnpm wt:down --volumes`, `pnpm wt:gc --yes` and `docker volume prune` delete databases. Get the user's explicit OK first; a harness archive hook is the one flow allowed to do it unprompted.

## Failure modes

Each of these has happened; recognize them before improvising.

- **`ECONNREFUSED` on a database command.** The wrapper was bypassed (a raw `vitest --config vitest.integration.config.ts`, a raw `drizzle-kit`). Run the pnpm script, or `pnpm wt ensure` once and retry.
- **`drizzle-kit: command not found` / empty host `node_modules`.** `pnpm wt:provision` (or any `ensure` that needs to migrate) fixes it. Don't install ad hoc.
- **Port already allocated.** Usually a stray `next start` from an aborted `verify:ci`, or a stack of a deleted worktree (`pnpm wt:doctor` flags those). Never change ports by editing `.env`; they are derived.
- **`.env` points at another worktree's Postgres.** A copied env file. `ensure` repairs it; `pnpm wt:env` regenerates it on demand.
- **`db.image` fails in doctor after a Postgres bump.** The container predates the pin. A major bump cannot reuse the volume: with the user's OK, `pnpm wt:down --volumes`, then any database command recreates and reseeds it.
- **App container "up" but the page hangs.** It installs its own `node_modules` and compiles on first start; `wt:app` waits up to 4 min. Past that, `pnpm wt:logs`.
- **Doctor warns about stale stacks.** Stacks whose worktree directory is gone. `pnpm wt:gc` lists them; `--yes` (with the user's OK) deletes them. It derives liveness from `git worktree list` and checks each candidate's recorded directory, so it never touches a stopped stack of a living worktree or another clone's stack. Rows marked "owner unknown" predate the provenance label and are never auto-deleted.

## Boundaries

- Never wipe volumes or prune without the user's explicit OK.
- Never mask a service failure with `sleep` or retry loops: run `pnpm wt:doctor --json` and read the checks.
- Never edit the generated `.env` lines (`DATABASE_URL`, `BETTER_AUTH_URL`, `E2E_BASE_URL`) by hand: `pnpm wt:env`.
- Never start tier 2 for work that needs only Postgres.
- In a Claude Code cloud session, the SessionStart hook provisions the checkout: `docs/agents/cloud-sessions.md`.
