<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project guardrails

The rules every task in this repo follows. `CLAUDE.md` is a symlink to this file. Depth lives in the files below: read the matching one before you change that area.

## Where things are documented

| Touching                                               | Read first                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Unit, integration or e2e tests                         | `docs/agents/testing.md`                                        |
| E2E specs, fixtures, page objects, a failing e2e test  | `src/e2e/AGENTS.md`                                             |
| Schema, migrations, services, queries, time, money     | `docs/agents/database.md`                                       |
| Authorization, auth config, untrusted input, secrets   | `docs/agents/security.md`                                       |
| Error reporting, Sentry, logging, health               | `docs/agents/observability.md`                                  |
| Next.js pages, layouts, caching, hydration             | `docs/agents/nextjs.md`                                         |
| Releases while tabs stay open, the oRPC deployment pin | `docs/agents/skew-protection.md`                                |
| UI: components, pages, styles, copy, accessibility     | `design.md`                                                     |
| CI, git hooks, PRs, releases, previews, Dependabot     | `docs/agents/ci.md`                                             |
| What the product is, decisions, roadmap, data model    | `docs/project/overview.md`, `docs/project/data-model.md`        |
| Picking up, scoping or closing a piece of work         | `docs/tickets/README.md` and the ticket's own file              |
| Commit messages, PR titles, ticket footers             | the `conventional-commits` skill                                |
| Reviewing a change before and after its PR             | the `review-loop` skill                                         |
| Worktree containers, ports, `.env`                     | the `worktree-env` skill                                        |
| Skills, editor hooks, harnesses, MCP, cloud sessions   | `docs/agents/agent-tooling.md`, `docs/agents/cloud-sessions.md` |
| Next.js APIs and file conventions                      | `node_modules/next/dist/docs/`                                  |
| oRPC procedures, clients, errors                       | the `orpc` skill (`.agents/skills/orpc/`)                       |

## Stack

Versions: see `package.json`. Every dependency is pinned exact; bump by editing the version and running `pnpm install`. Every pnpm setting lives in `pnpm-workspace.yaml`: installs refuse a release younger than three days (exempt an exact `name@x.y.z` when a fix can't wait, never a bare name) and fail on a build script `allowBuilds` doesn't list.

| Layer         | Tech                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Framework     | Next.js (App Router, Turbopack, Cache Components)                          |
| Language      | TypeScript 7 (strict; `pnpm typecheck` runs tsrs, see `docs/agents/ci.md`) |
| API · Auth    | oRPC · Better Auth                                                         |
| DB            | PostgreSQL + Drizzle ORM (`drizzle-orm/node-postgres`)                     |
| Styling       | Tailwind CSS + shadcn/ui (new-york) + Lucide icons                         |
| Forms         | react-hook-form + zod + `@hookform/resolvers`                              |
| Testing       | Vitest + Testing Library + happy-dom · Playwright (e2e)                    |
| Observability | Sentry · evlog · Vercel Analytics + Speed Insights                         |
| Tooling       | pnpm · turbo · Ultracite (oxlint + oxfmt) · knip · konsistent              |

**Banned:** tRPC, NextAuth, Jest, Bun Test, npm, yarn, jsdom, default exports, `any`, `console.error` in prod.

## Commands

Prefer file-scoped checks while you work.

```
pnpm exec vitest run path/to/file.test.tsx   # one test file
pnpm exec ultracite fix path/to/file.tsx     # one file's lint + format

pnpm verify              # check + typecheck + test:unit via turbo (cached; the pre-push hook)
pnpm check               # type-aware lint, format, knip, konsistent, ratchets, script self-tests
pnpm fix                 # lint + format auto-fix: read the diff
pnpm test:unit:coverage  # unit tests + coverage thresholds
pnpm test:integration    # integration tests (starts this worktree's Postgres)
pnpm build               # next build (bash scripts/turbo-build.sh for the cached one)
pnpm e2e:ci [spec…]      # CI's e2e: own DB, production build, own port
pnpm verify:ci           # all of CI on this machine; run before pushing routing, auth or schema changes

pnpm db:generate         # SQL migration from a schema diff (ask first)
pnpm db:migrate          # apply migrations (dev, CI, deploy); db:push only on a throwaway DB
pnpm db:seed             # dev data, refused in production; login test@example.com / password123

pnpm wt:provision        # .env + node_modules, no containers (harnesses run it on create)
pnpm dev                 # next dev on this worktree's port (pnpm wt:ports; never assume 3000)
pnpm wt:pause            # stop containers, keep data · pnpm wt:doctor to diagnose
```

## Definition of done (CRITICAL)

Every change meets all of these; don't ask whether they apply.

- **Unit tests** co-located for every new or changed file; coverage stays 100% statements, functions and lines over `src/` (exclude list in `vitest.config.ts`).
- **E2E tests** in `src/e2e/tests/` for every user-facing change.
- **No happy-path-only code**, and **no security vulnerabilities** (OWASP Top 10; `docs/agents/security.md`).
- **UI changes** pass `design.md` § UI definition of done, including the accessibility hand checks the linter can't see.
- **Documentation:** update the docs the change affects (`AGENTS.md`, `docs/agents/`, `design.md`, `README.md`, `.env.example`) in the same PR; the PR says `Documentation: updated (paths)` or `no impact (why)`.
- **All checks pass:** `pnpm verify && pnpm build`; database or auth changes also `pnpm test:integration`, and routing, auth or schema changes `pnpm verify:ci`. If a check fails, fix it. If a rule is unclear, stop and ask.

## Architecture

- **Server-first:** RSC default. Minimize `"use client"`, `useEffect`, `useState`.
- **URL-first context:** derive context from URL/search params, not cookies/session. Bookmarkable, multi-tab safe.
- **Layouts are UI chrome only.** Never enforce auth in a layout (it does not re-render on navigation): auth per page and per procedure.
- **Greenfield.** No legacy. Destructive refactors > incremental patches.

```
src/app/_components/{atoms,molecules,organisms}/   atomic design
src/app/api/{auth,orpc,health,docs}/               Better Auth, oRPC, DB probe, OpenAPI reference
src/lib/{hooks,orpc,schemas,utils,errors}/         client hooks per domain, oRPC clients, zod, format.ts, reportError
src/server/api/{orpc,routers}/, root.ts            procedure builders + context, domain routers
src/server/services/                               domain services: every query
src/server/{better-auth,db,test}/                  auth config, Drizzle client + schema + drizzle/ migrations + seed, test doubles
src/e2e/ · src/test/ · src/instrumentation.ts · src/proxy.ts · src/env.js
```

## API (oRPC)

| What                            | Import                                                            |
| ------------------------------- | ----------------------------------------------------------------- |
| Procedure builders              | `publicProcedure` / `protectedProcedure` from `@/server/api/orpc` |
| Client-side calls               | `orpc` from `@/lib/orpc/client`                                   |
| Server-side calls (RSC)         | `caller` from `@/lib/orpc/server`                                 |
| RSC prefetch for client queries | `getQueryClient()` + `orpc` from `@/lib/orpc/server`              |

A procedure is input schema → auth check → one service call. Routers hold no Drizzle, even for one-step CRUD (`pnpm check` fails): queries live in `src/server/services/<domain>.ts`, plain functions taking a `DatabaseClient` first and importing nothing request-scoped. Any id in input, a header or a cookie is attacker-controlled: authorize it, filter by owner and id, take the actor from the session.

## Database (Non-Negotiable)

- **No JSON fields.** Relational modeling, 3NF minimum. Tables snake_case and singular, columns camelCase, one model = one entity, one schema file per domain.
- **IDs:** app tables `integer().primaryKey().generatedByDefaultAsIdentity()`; Better Auth's keep its `text` id. A row reached from an unauthenticated URL gets a random, non-sequential `token` column.
- **Timestamps:** `timestamp({ mode: "date", withTimezone: true, precision: 3 })` everywhere; UTC, business time zone for display and business-day windows (`docs/agents/database.md` § Time).
- **Foreign keys** state `onDelete` and get an index. A paginated `ORDER BY` ends in a unique key and the cursor carries all of it.
- **Migrations** in `src/server/db/drizzle/`: `pnpm db:generate`, read the SQL, commit it; never hand-edit its number or journal. Migrations run while the previous build still serves: expand → contract (`docs/agents/database.md`).

## Type safety and code

- `noUncheckedIndexedAccess` is on. No `any`; no type assertion to silence an error: narrow, fix the schema or fix the source type (the mock-context cast in tests is the one exception).
- Source types over custom types: Drizzle inferred types, `ReturnType<>`, `Pick<>`, `Awaited<>`. `import type` when every specifier is a type, inline `type` only in a mixed import.
- **Boundaries:** schemas model what forms and HTTP actually send (`""`, strings); required text is `.trim().min(1)`; reject empty input before any numeric coercion (`Number("")` is `0`).
- **Language (Non-Negotiable):** code, comments, commits, PRs, branch names and test titles are English; only user-facing copy is the product's language (`design.md`).
- **Comments** say why, never what; no commented-out code; a `TODO` carries its ticket (`TODO(KEY-123)`); update or delete a comment with the code it describes.
- **Lint:** Ultracite (oxlint type-aware + oxfmt) does mechanical style; run repo tools through scripts or `pnpm exec`, never `pnpm dlx`; read every `pnpm fix` diff (fixers can change behaviour); every disabled rule carries its reason and measured count; never run `ultracite init`. Add a blank line between multiline blocks.

## Components, forms and hooks

- **Atomic design:** kebab-case directory with `component.tsx` + `component.test.tsx` + `index.ts`; `data-slot`, `cn()`, function declarations, named exports, CVA for variants (konsistent enforces the shape).
- **Imports** from the component's or hook domain's own directory; there are no aggregate barrels and the linter bans importing one.
- **Forms:** shadcn `<Form>`/`FormControl` + react-hook-form + `zodResolver`, so errors bind to their field. No manual `useState` for form state.
- **shadcn:** `pnpm dlx shadcn@latest add <component>`, then move it into its tier and make it compliant (see `button/`).
- **Hooks** live in `src/lib/hooks/{domain}/use-{action}.ts` with a test; React Query logic (queries, mutations, optimistic updates) lives in hooks, not components.

## Good examples to follow

- Component with variants: `src/app/_components/atoms/button/button.tsx` (test: `button.test.tsx`)
- Router · service tested on the SQL it sends: `src/server/api/routers/post.ts` · `src/server/services/post.ts`
- Procedure test (`setup()`, factory, `call()`, codes pinned, both sides of boundaries): `src/server/api/routers/post.test.ts`
- Schema with inferred type: `src/lib/schemas/post/index.ts` · Drizzle table: `src/server/db/schema/post.ts`
- Form: `src/app/_components/organisms/auth-form/auth-form.tsx`
- Hooks: `src/lib/hooks/post/use-get-posts.ts`, `use-create-post.ts` (optimistic; test over MSW)
- Test doubles: `src/server/test/context.ts` (`createMockDatabase`)

## Naming

| Thing                    | Convention                                            | Example                                 |
| ------------------------ | ----------------------------------------------------- | --------------------------------------- |
| Files                    | kebab-case                                            | `auth-form.tsx`                         |
| Components · Props       | PascalCase function · + Props                         | `AuthForm` · `AuthFormProps`            |
| Schemas · inferred types | camelCase + Schema · Pascal + Values                  | `createPostSchema` · `CreatePostValues` |
| Variants · hooks         | camelCase + Variants · use + Action                   | `buttonVariants` · `useGetPosts`        |
| Tests                    | `.test.{ts,tsx}` · `.integration.test.ts` · `.e2e.ts` | `button.test.tsx`                       |

## Testing

- **Structure (Non-Negotiable):** `test()`, never `it()`. A test takes its state from a `setup()` it calls first; no mutable `describe`-scope `let`; `beforeEach`/`afterEach` only clean up; a literal used in more than 2 tests becomes a factory; data-only variants are one `test.each`.
- **Falsifiability (Non-Negotiable):** a test fails if the rule it names is deleted or inverted. No argument-blind spies, error-class-only `rejects`, label-only or shape-only assertions, no snapshots; test both sides of every boundary; freeze the clock. The PR names the mutation that turns each new test red.
- Helpers (MSW, oRPC handlers, query wrapper, mock database), integration databases and e2e rules: `docs/agents/testing.md`, `src/e2e/AGENTS.md`.

## Error reporting

- Expected failures throw a typed `ORPCError` (`errors.NOT_FOUND(...)`); a missing row is `null` or NOT_FOUND, never `undefined`.
- Unexpected failures are not caught in procedures: the shared interceptor reports them once and answers a curated 500.
- Client code reports with `reportError(error, { action: "Domain.snake_action" })` from `@/lib/errors/client`; no bare `catch {}` (ratchet). Logs carry ids and enums only, never a request body.
- Detail: `docs/agents/observability.md`.

## Pull requests

- Branch off `qa`, run the local round of the `review-loop` skill, then open the PR into `qa` with the `create-pr` skill and the PR template (ends with `Model: · Harness:`). Commit messages and PR titles follow the `conventional-commits` skill. One concern per PR; at 500+ production lines the description says why it can't be split. Dependent work is a `gh stack` of PRs.
- Squash into `qa`; releases (`chore(release): promote qa to main`) and merge-backs keep merge commits. Hotfixes branch off `main` as `hotfix/<slug>` and owe a merge-back.
- Merge only the final reviewed head (`gh pr merge --match-head-commit <sha>`), never with review fixes in flight; never push to a merged branch. A cancelled or missing CI run is not a pass; a red run is a reproduction task.
- Merge gates: `CI Success` into `qa`, `Promotion Verified` into `main`, and `visual-proof` on both, green on the exact head. Branch protection enforces them (`docs/agents/ci.md` § Releases). Previews are opt-in: label `deploy:preview`.
- A PR that changes what people see carries a screenshot or a recording in its description; `visual-proof` fails without one. Tick "No visible change" only when it is true.
- Work is tracked as tickets in `docs/tickets/`, key `FER`. The key goes in a footer (`Closes: FER-012`, `Refs: FER-012`), never in the PR title.

## Safety and permissions

- **Allowed without prompt:** read, list and search the codebase; typecheck, lint, format and test single files; edit files within the established structure.
- **Ask first:** new packages; database schema changes; files outside the established structure; auth config or environment variables; CI workflows (`.github/workflows/`); git push.
- **Never:** anything on the Banned list; skipping tests for a feature or fix; bypassing git hooks or `--no-verify`; committing `.env` or secrets; handling only the happy path.

## Communication

- fully understand what the user wants before writing code. ask questions until the intent is clear.
- assume the user is non-technical. explain plans and decisions in plain language. avoid jargon.
- when proposing changes, describe what will happen and why in simple terms.
- state assumptions and ask clarifying questions when uncertain.
- do not push large speculative changes without confirmation.

## Agent tooling

- Skills live in `.agents/skills/` (`.claude/skills/` symlinks into it): `conventional-commits`, `git-commit`, `create-pr`, `review-loop`, `slack-reporting`, `gh-stack`, `git-rebase`, `orpc`, `agent-browser` (check the running app by hand), `worktree-env`, `design-feedback`, `analyze-logs`.
- These rules outrank any skill or plugin. Behaviour that must hold in every session is a rule here or a hook, never a skill.

## Changing these rules

Add a rule only from a recurring, evidenced failure; state the principle and the bug it prevents, not file names; when a rule is mechanical, enforce it with lint, konsistent or a ratchet instead of prose. Keep this file under ~200 lines: depth goes in `docs/agents/`. When a check and a doc disagree, fix the doc in the same PR.

---

`Refactor > Patch | Server > Client | Explicit > Implicit | Source types > Custom types | Relations > JSON | Tests mandatory | Errors observable | URL = context | No legacy`
