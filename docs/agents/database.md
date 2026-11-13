# Database

Detail behind `AGENTS.md` § Database. Read it before you change a schema, a migration, a service or a query.

## Services own every query

- A service is a plain async function in `src/server/services/<domain>.ts` that takes a `DatabaseClient` (from `@/server/db`: the db or a transaction handle) first and owns every Drizzle query and transaction, so crons, scripts and tests reuse it without a request.
- A router is input schema → auth check → service call → return, with no Drizzle, even for one-step CRUD: one rule, no per-file debate.
- Services never import request-scoped modules (`next/headers`, React) or take the oRPC `context`.
- A service that can join a caller's transaction uses only the handle it is given. If the app audits, the service writes the audit row in the mutation's own transaction.
- A write that matched zero rows throws NOT_FOUND or CONFLICT, never reports success.
- Enforced: konsistent bans Drizzle imports in routers and request-scoped or React imports in services; `scripts/lint-router-db.sh` catches `context.db.query…` and other client member access in a router.
- A service test asserts the SQL the driver would receive, not just the rows the mock returns: `renderQuery(where)` (text and bound values) and `renderOrderBy(orderBy)` from `@/server/test/render-sql`, as `src/server/services/post.test.ts` does.

## Multi-step writes: resolve → lock → commit

Binding on any service that writes based on what it read: a violation corrupts data silently and surfaces at a reconciliation, not at write time.

1. **One resolver per derived value:** one pure `resolve*`/`calculate*` function every writer calls. The client may preview it; the service re-derives it at commit and that value wins. Derived fields stay out of client-writable schemas.
2. **Re-read inside the writing transaction.** Money, stock, counts and status are selected in the transaction that writes them; passing one into the commit step is the bug.
3. **Lock before deriving.** `.for("update")` every row you read then write under contention, many rows per statement. Lock config or flag rows you branch on `FOR SHARE`, a row that only has to exist `FOR KEY SHARE`.
4. **One lock order** for every flow. A `40P01` deadlock is a lock-order bug to fix, never an error to translate into CONFLICT.
5. **Branch on the canonical source,** never a denormalized mirror.
6. **Business time comes from the database clock:** `clock_timestamp()` read after the locks are held, never a client date. `now()` is frozen at transaction start, so a lock wait can stamp the previous day.
7. **Row locks before stricter isolation.** Under SERIALIZABLE or REPEATABLE READ, one retry helper retries `40001` and `40P01`, re-deriving everything and waiting with full jitter: an instant retry replays the collision. Drizzle wraps driver errors; read the SQLSTATE from the `cause` chain.
8. **Generated numbers** are reserved in the writing transaction (a counter row or `pg_advisory_xact_lock`), never `max() + 1`.

**Gate:** a new multi-step workflow ships a `*.integration.test.ts` with two interleaved writers, the second started once the first holds its lock (check `pg_blocking_pids`, never sleep), plus a control case. It must fail when the lock is removed.

## Migrations

- **`pnpm db:migrate` everywhere:** dev, worktrees, CI, deploy. `db:push` is for throwaway databases; it never runs the files production runs.
- **Read the generated SQL** before committing it. drizzle-kit emits every difference from its snapshot: a rename becomes DROP + CREATE (data loss), and another branch's pending drop rides along.
- **Journal order.** The migrator applies an entry only if its `when` is newer than the last applied one, skipping older ones silently. When another migration lands first, delete yours (SQL and snapshot), rebase and generate again; never hand-rename or renumber. Hand-written SQL starts from `pnpm db:generate --custom`. A unit test checks that `when` only increases.
- **Enums.** Never `ALTER TYPE … ADD VALUE` and use the value in the same deploy: pending migrations run in one transaction, and Postgres refuses a value in the transaction that added it unless that transaction created the type, which only happens on a fresh database. CI passes; the deploy fails.
- **Expand → stop reading → contract.** The deploy migrates while the previous build still serves, and open tabs keep calling it, so a migration must work with that build. Add and dual-write; a later release removes the column from the Drizzle schema (Drizzle names every declared column in inserts and default reads); a release after that drops it. A new input field gets no default that changes meaning when a stale client omits it.
- **Destructive and backfill migrations** are idempotent (`IF [NOT] EXISTS`, `DO $$` guards), fill only (`IS NULL`, `IS DISTINCT FROM`, `NOT EXISTS`), dedup before constraining, repoint FKs before deleting, and skip a drop on a populated table with `RAISE NOTICE` rather than abort the deploy. A co-located integration test seeds the conflicting pre-state, applies the migration twice and asserts convergence. A from-zero run misses all this and the enum and journal traps: replay incrementally (migrate to N-1, commit, apply N).
- **Large tables.** `CONCURRENTLY` can't run in the migration's transaction, so an index on a populated table is `CREATE INDEX IF NOT EXISTS` in the migration plus `src/server/db/manual/concurrent-<slug>.sql` (same name, `CONCURRENTLY`, recovery for an `INVALID` build) run with `psql` on the direct URL before the release. A migration adding a column to a large table ends with `ANALYZE "<table>";`: the column has no statistics until 10% of the rows change.
- **Migration credentials.** Production migrates with `MIGRATION_DATABASE_URL` (owner role, direct non-pooled endpoint); the app runs as a DML-only role on `DATABASE_URL`. Read it in `drizzle.config.ts` only, never `src/env.js`, so the app never sees it.

## Preview databases

An optional module for the opt-in previews (`docs/agents/ci.md` § Previews). Every preview build runs `pnpm db:migrate`, so a preview pointed at a shared database lands an unmerged PR's migration there.

- **How:** the Vercel–Neon integration gives each preview deployment its own Neon branch, `preview/<git branch>`, and sets that deployment's `DATABASE_URL`. It can also rewrite `DATABASE_URL` in the long-lived environments, so production and qa read variables it never writes. `src/env-database-url.js` picks `PRODUCTION_DATABASE_URL` or `QA_DATABASE_URL` from `VERCEL_TARGET_ENV` (or the `qa` branch); previews, local runs and CI read `DATABASE_URL`. `src/env.js` and `drizzle.config.ts` both resolve through it.
- **Fail closed:** without `NEON_PREVIEW_BRANCHES=1`, production or qa missing its dedicated variable falls back to `DATABASE_URL`, as before the module. With it, the build and the boot fail instead: `DATABASE_URL` may be a preview branch.
- **Migrations** use `MIGRATION_DATABASE_URL` when set, else the resolved URL. Scope it to production and qa only (the owner role on the direct, non-pooled endpoint): set for Preview, every preview would migrate that database.
- **Cleanup:** `neon-cleanup.yml` deletes the branch when its PR closes. `neon-prune.yml` deletes, daily, every `preview/*` branch older than two days with no open PR; a manual run is a dry run unless unticked. Runs Dependabot triggers get no secrets, so their branches wait for the prune. Unconfigured, both only print a notice.

**Setup, in this order** (the integration rewrites `DATABASE_URL` on install):

1. In Vercel, add `PRODUCTION_DATABASE_URL` (Production) and `QA_DATABASE_URL` (the qa environment, or Preview limited to the `qa` branch) with the current URLs. Redeploy both and check them.
2. Install the Neon integration on the project, creating a branch per preview deployment.
3. Add `NEON_PREVIEW_BRANCHES=1` to every environment.
4. In GitHub, add the secret `NEON_API_KEY` and the variable `NEON_PROJECT_ID`.
5. Label a PR `deploy:preview`, check that its build log migrated a `preview/…` branch, close the PR and check the branch is gone.

## One-shot data repairs

A fix for rows the previous build wrote, or can still write, is a script run after cutover, never a migration: migrations run in the build, while the old one still serves.

- `src/server/db/maintenance/repair-<slug>.ts`: a thin CLI (`--dry-run` doubles as the census) over a tested service `(db, { dryRun })`, run as `pnpm db:repair:<slug>`. It loads `.env` itself; `tsx` doesn't.
- Run once per environment, after the new build is live and no open tab still runs the old one.
- Idempotent and fill-only. Lock candidates `FOR UPDATE`; guard each UPDATE on the planned value (`WHERE id = … AND col = <planned>`), reporting changed rows as skipped; classify every row before writing and abort if one doesn't fit; loop until a pass changes nothing. An integration test seeds the artifact next to sane rows.
- Runbook `docs/agents/<slug>-repair.md`: What went wrong · The rollout is ordered · What it does · What it deliberately leaves alone · Idempotence · Verifying an environment (SQL that must return 0). Delete the script once run everywhere.

## Query habits

- **Sets, not rows:** no query inside a loop over request data. Prefetch with `inArray`; upsert or `UPDATE … FROM (VALUES …)` many rows per statement.
- **Page, then aggregate** only the page. Count separately, capped (`count(*)` over `LIMIT cap + 1`, shown as "N+").
- **Total order:** a paginated `ORDER BY` ends in a unique key, and the cursor carries the whole sort key.
- **Sargable predicates:** filter the bare indexed column (`createdAt >= $start`), not a function of it; an expression index matches only its exact spelling.
- **Index every foreign-key column** (Postgres doesn't) and state `onDelete` on every reference.
- **`Promise.all` over top-level queries takes one pooled connection each.** Run a multi-read snapshot as one read-only transaction.

## Soft delete

Only when history must keep resolving the row: `deletedAt timestamptz` set in a transaction, visibility filtered by one helper every list and search uses, unique codes kept reserved, and every writer refusing rows the readers hide. Otherwise hard delete, with an explicit `onDelete`.

## Time

- Timestamps are `timestamptz`; instants are stored in UTC.
- **Business days come from one helper in the business time zone:** report windows, "today", buckets, expiries, dates sent to third parties. Never `toISOString().slice(0, 10)` or UTC midnight.
- **Date-only values are not instants:** keep a due date as `YYYY-MM-DD` (a `date` column). `z.coerce.date()` reads `"2026-08-31"` as UTC midnight, the evening before west of UTC, and `new Date("2026-02-31")` is March 3. Parse date-only input in one schema helper that checks the calendar and bounds the year.
- Never format with host-local getters (`getHours()`, `toLocaleString()` without `timeZone`): servers run in UTC, laptops don't. Test under another `TZ`.

## Money and input values

- Money is `numeric` or integer minor units, never a float. Round once, at a defined boundary, keeping any adjustment as its own value; never back-derive an input from a rounded number.
- Store what the user entered; derive the rest.
- **Unset is not 0:** "not set" is a nullable column, never `default(0)`. `?? 0` turns missing into a plausible number, and `x ?? fallback` keeps a stored 0.
- Required text is `z.string().trim().min(1)`: `min(1)` accepts `"   "`.
- **Column limits are boundary validation:** the zod schema caps what the column holds (`numeric(p,s)` maximum, int4 range, 0–100 for a percentage), so an overflow is a 400, not a 500; a CHECK constraint backs it.
