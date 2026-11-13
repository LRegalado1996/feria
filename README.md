<div align="center">

# Streaver Template

[![CI](https://github.com/streaver/template/actions/workflows/ci.yml/badge.svg?branch=qa)](https://github.com/streaver/template/actions/workflows/ci.yml)
[![Next.js 16.4](https://img.shields.io/badge/Next.js-16.4-000?style=flat-square&logo=nextdotjs&logoColor=FFF)](package.json)
[![TypeScript 7](https://img.shields.io/badge/TypeScript-7%20strict-3178C6?style=flat-square&logo=typescript&logoColor=FFF)](tsconfig.json)
[![PostgreSQL 18.6](https://img.shields.io/badge/PostgreSQL-18.6%20pinned-4169E1?style=flat-square&logo=postgresql&logoColor=FFF)](docker-compose.base.yaml)
[![Coverage 100% lines](https://img.shields.io/badge/coverage-100%25%20lines%2C%20enforced-1a7f37?style=flat-square)](vitest.config.ts)
[![Private](https://img.shields.io/badge/repo-private-18181B?style=flat-square)](#security)

</div>

**Streaver Template** is the starting point for Streaver's web apps. One Next.js deployment on Vercel holds the pages, a typed oRPC API, Better Auth email and password sign-in, and PostgreSQL through Drizzle ORM. A small posts demo runs through every layer once: sign in, write a post, scroll the feed, delete your own post.

The demo is small on purpose. The value is the machinery around it: guardrails that fail the build instead of relying on review, tests that must be able to fail, one place that reports errors, and a release pipeline that only ships what CI tested. Every rule was added because a real bug shipped without it, and [`AGENTS.md`](AGENTS.md) records why.

## Architecture

```mermaid
flowchart LR
    B["Browser<br/>React 19 · React Query<br/>oRPC client pinned to its deployment"]
    subgraph Vercel["One Vercel deployment"]
        X["proxy.ts<br/>request id on every /api call"]
        P["Pages<br/>server components first<br/>Cache Components · React Compiler"]
        H["/api/orpc · /api/auth<br/>/api/health · /api/docs"]
        R["Routers<br/>zod input → auth → one service call"]
        S["Services<br/>plain functions over the database"]
        I["Interceptor<br/>reports each defect once"]
    end
    D[("PostgreSQL 18.6<br/>Drizzle ORM")]
    O["Sentry · evlog<br/>Vercel Analytics"]
    B --> P
    B --> X --> H --> R --> S --> D
    R -.-> I -.-> O
```

The boundaries that hold it together. Each one is written up in full, with the bug it prevents, in [`AGENTS.md`](AGENTS.md) and [`docs/agents/`](docs/agents):

- **Routers are thin; services own every query.** A procedure validates its input with zod, checks auth, and makes one service call. A service is a plain function that takes the database first and nothing request-scoped, so a script or a test can call it too. `pnpm check` fails if a router imports Drizzle.
- **An id from the client is a claim, never a grant.** The actor comes from the session. A write filters by owner and id together, so deleting someone else's post finds nothing and answers "not found".
- **The database is relational.** No JSON columns, 3NF at least. App tables use integer identity ids, timestamps carry their time zone, and every foreign key states `onDelete` and has an index. A paginated list sorts on a unique key, so pages never shuffle.
- **Errors are reported once, in the right place.** An expected failure (not signed in, not found) is a typed `ORPCError` and is not an incident. A Postgres constraint error becomes an answer the user can act on. Anything else is reported to Sentry once and answered with a curated 500 that never leaks the raw message.
- **Server first, URL as context.** Pages are server components unless they need interaction. Context lives in the URL, not in cookies, so every view is bookmarkable and safe in several tabs. Layouts never enforce auth: each page and each procedure does.
- **Releases never break open tabs.** Every oRPC call carries the deployment id of the page that made it, and Vercel's Skew Protection routes it to that build. A tab opened before a release keeps working ([`docs/agents/skew-protection.md`](docs/agents/skew-protection.md)).

## One request, end to end

Creating a post:

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as Compose box<br/>useCreatePost
    participant A as /api/orpc<br/>post.create
    participant S as createPost<br/>service
    participant D as PostgreSQL
    U->>C: types a post and sends it
    C->>C: shows it in the feed at once (optimistic)
    C->>A: post.create, pinned to this deployment
    A->>A: session check, then zod input
    A->>S: createPost(db, name, author from the session)
    S->>D: insert into post
    D-->>S: the new row
    S-->>C: the post
    C->>C: refreshes the feed from the server
    Note over C,A: On failure the feed rolls back, the text stays in the box,<br/>and the error is reported once
```

The page itself renders on the server: it fetches the first page of the feed and hands it to the browser with the HTML, behind a skeleton while it loads. If that fetch fails, the feed fetches again from the browser instead of showing an empty list.

## Getting started

You need Docker (Docker Desktop or OrbStack), the Node version in [`.nvmrc`](.nvmrc), and pnpm 11 (`corepack enable` installs the version pinned in `package.json`).

```bash
pnpm wt:provision   # installs dependencies and writes this worktree's .env; starts no containers
pnpm db:seed        # starts this worktree's Postgres, migrates it, adds a post and a login: test@example.com / password123
pnpm dev            # next dev on this worktree's own port
pnpm wt:ports       # prints that port, the Postgres port and the app URL (it is not 3000)
```

Every git worktree gets its own database and ports, so several branches run side by side. Commands that need the database start it themselves, so there is no "start the stack" step to remember. `pnpm wt:pause` stops the containers and keeps the data; `pnpm wt:doctor` diagnoses a worktree that will not come up. The full lifecycle is in the [`worktree-env` skill](.agents/skills/worktree-env/SKILL.md).

## Everyday commands

| Command                                     | What it does                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run path/to/file.test.ts` | one test file: the loop you will live in                                                                                         |
| `pnpm verify`                               | check + typecheck + unit tests through Turborepo; an unchanged tree replays in about a second                                    |
| `pnpm build`                                | `next build`; with `pnpm verify`, the definition of done                                                                         |
| `pnpm check` / `pnpm fix`                   | type-aware lint and format (Ultracite), knip, structure rules, ratchets, script self-tests                                       |
| `pnpm typecheck`                            | `tsrs --noEmit`, the Rust port of the TypeScript 7 compiler, for the app and the e2e suite; `next build` still checks with `tsc` |
| `pnpm test:unit:coverage`                   | unit tests with the coverage thresholds                                                                                          |
| `pnpm test:integration`                     | integration tests against this worktree's real Postgres                                                                          |
| `pnpm e2e` / `pnpm e2e:ui`                  | Playwright against this worktree's dev server, headless or interactive                                                           |
| `pnpm e2e:ci [spec]`                        | CI's e2e: its own database and a production build                                                                                |
| `pnpm verify:ci`                            | all of CI on this machine, on its own database; run it before pushing routing, auth or schema changes                            |
| `pnpm db:generate` → `pnpm db:migrate`      | after editing a schema file: read the generated SQL, commit it, apply it                                                         |
| `pnpm db:studio`                            | browse this worktree's database                                                                                                  |

Git hooks run the same tools: the pre-commit hook fixes and checks the staged files and scans them for secrets, and the pre-push hook runs `pnpm verify`.

## Testing

| Layer       | Where                                     | What it needs                                                                                   |
| ----------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Unit        | next to the code, `*.test.{ts,tsx}`       | nothing: Vitest with happy-dom; 100% of statements, functions and lines in `src/`               |
| Integration | next to the code, `*.integration.test.ts` | a real Postgres; each test worker gets its own cloned database                                  |
| End to end  | [`src/e2e/tests/`](src/e2e/tests)         | Playwright; CI and `pnpm e2e:ci` run the production build; each worker signs in as its own user |

Retries are zero in every suite, locally and in CI. A test that passes on the second try is a race that ships, so a failure fails the run and the retained trace explains it.

Coverage proves the code ran, not that it is right. A test must fail if the rule it names is deleted or inverted: assert the returned data and the side effect, check the arguments a spy received, and test both sides of every boundary. The rules and helpers (MSW, oRPC handlers, the mock database) are in [`docs/agents/testing.md`](docs/agents/testing.md); e2e specs follow [`src/e2e/AGENTS.md`](src/e2e/AGENTS.md).

## Repository map

```text
src/
  app/
    _components/        atoms · molecules · organisms (atomic design)
    api/orpc/           the oRPC handler
    api/auth/           Better Auth
    api/health/         database probe, optionally behind HEALTH_SECRET
    api/docs/           OpenAPI reference for the API
    page.tsx            the home page: feed, compose box, sign-in
  server/
    api/routers/        thin routers, one per domain
    api/orpc/           procedure builders and request context
    api/interceptor.ts  classifies and reports every failure
    services/           every database query
    db/schema/          Drizzle tables, one file per domain; drizzle/ holds the migrations
    better-auth/        auth config
    test/               mock context and mock database for tests
  lib/
    hooks/              React Query hooks per domain
    schemas/            zod schemas per domain
    orpc/               clients for the browser and for server components
    errors/             reportError and error helpers
  e2e/                  Playwright specs, page objects, fixtures
  test/                 test setup, MSW handlers, mocks
  proxy.ts              stamps a request id on every /api call
scripts/                worktree stack, CI parity, ratchets and guards; each one tests itself
docs/agents/            depth per area
```

## Environments and CI

| Branch          | Role                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `qa`            | default base for pull requests; every push runs the full pipeline and deploys                          |
| `production`    | `[RELEASE] QA -> Production` opens by itself when `qa` has something new; merge it with a merge commit |
| `hotfix/<slug>` | off `production`, only when `qa` cannot carry the fix; it owes a merge-back to `qa`                    |

CI classifies the change, then runs Static Checks, Unit Tests, Integration Tests and Build in parallel, then E2E in the pinned Playwright container against that build, with Gitleaks alongside. `CI Success` is the single merge gate into `qa`. A release into `production` must pass `Promotion Verified`, which accepts only a tree that already passed CI on `qa`, so production runs exactly what was tested.

A pull request that touches only Markdown or `docs/` skips the runtime jobs, and a draft runs only the static checks. Vercel deploys `qa` and `production` through its Git integration. Previews are opt-in: add the `deploy:preview` label. Dependabot opens grouped updates once a week, after a cooldown, and merges patch and minor ones once CI passes; major versions wait for a person. The details are in [`docs/agents/ci.md`](docs/agents/ci.md).

## Starting a new project from this template

1. **Create the repository** with GitHub's **Use this template** button.
2. **GitHub settings:**
   - Install the org GitHub App, then add the `BOT_APP_ID` variable and the `BOT_APP_PRIVATE_KEY` secret, so release PRs and bot merges start CI.
   - Set the default workflow permissions to read.
   - Require `CI Success` on `qa` and `Promotion Verified` on `production` in a ruleset. A private repository needs a paid GitHub plan for one; on GitHub Free nothing enforces either check.
   - Create the labels `deploy:preview` and `size:XS` through `size:XXL`.
3. **Vercel project:**
   - Import the repository and set `production` as the production branch.
   - Turn on Skew Protection (Settings → Advanced) and Analytics and Speed Insights.
   - Keep the function region next to your database (`regions` in [`vercel.json`](vercel.json), `iad1` by default).
4. **Environment variables:** `DATABASE_URL` and `BETTER_AUTH_SECRET` in each environment. Previews must never share a real database: see [`docs/agents/database.md`](docs/agents/database.md) § Preview databases.
5. **Optional services**, each inert until configured:
   - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
   - `HEALTH_SECRET` for the health probe.
   - Turborepo remote cache: `TURBO_TOKEN`, `TURBO_TEAM`, `TURBO_REMOTE_CACHE_SIGNATURE_KEY`.
   - Previews: the `preview` environment and its token ([`docs/agents/ci.md`](docs/agents/ci.md) § Previews).
6. **Replace the demo.** Posts show each layer once: schema, service, router, hook, component, and their tests. Copy that shape for your own domain, then delete the posts.

## Documentation

| Read this                                | For                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                 | the rules every change follows, for people and AI agents alike. Read it first               |
| [`design.md`](design.md)                 | UI rules: tokens, typography, layout, copy and accessibility. Read it before building UI    |
| [`docs/agents/`](docs/agents)            | depth per area: testing, database, security, observability, Next.js, CI, agent tooling      |
| [`src/e2e/AGENTS.md`](src/e2e/AGENTS.md) | how e2e specs, fixtures and page objects are written                                        |
| [`konsistent.json`](konsistent.json)     | the file-structure rules a linter cannot express, such as which files must sit together     |
| [`.agents/skills/`](.agents/skills)      | skills for agents: opening PRs, commits, oRPC, the worktree stack, checking the running app |

Documentation is part of the change: every pull request says `Documentation: updated` with the paths, or `no impact` and why.

## Security

- **Never commit `.env` or a secret.** Gitleaks checks each commit in the pre-commit hook, and CI scans the whole history. Never bypass a hook with `--no-verify`.
- **Fixtures use made-up data.** Fake secrets and passwords in tests start with `synthetic-`, the only values the scanner lets through, and only in test files.
- **Logs carry ids and enums only**, never a request body or free text. Unexpected errors reach the browser as a curated message with an event id, never the raw error.
- **Authorize every id.** Any id in input, a header or a cookie comes from the caller: filter by owner and id, and take the actor from the session ([`docs/agents/security.md`](docs/agents/security.md)).

---

`Refactor > Patch · Server > Client · Explicit > Implicit · Source types > Custom types · Relations > JSON · Tests mandatory · Errors observable · URL = context · No legacy`
