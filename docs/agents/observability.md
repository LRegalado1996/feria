# Observability

Detail behind `AGENTS.md` § Error reporting. Read it before you report an error, log from server code, add a log egress, or touch `instrumentation*.ts`, `sentry.server.config.ts`, `src/lib/sentry*.ts`, `src/lib/evlog.ts` or `src/proxy.ts`.

## Error reporting

- **Expected failures throw a typed error:** `errors.NOT_FOUND({ message, data: { fix } })` or `new ORPCError(code, …)`. `data` is `AppErrorData` (`@/lib/errors`): `why` only from `ERROR_WHYS`, never PII, tokens or stacks. A row the caller may not see is NOT_FOUND; data the user can correct is a typed 4xx, never a plain `Error`. A missing row is `null` or NOT_FOUND, never `undefined`: TanStack Query fails a query that resolves `undefined`. A service throws the typed error for a known business failure and a plain `Error` for an unexpected one.
- **Unexpected failures are not caught in procedures.** `interceptErrors` (`src/server/api/interceptor.ts`, on every oRPC handler) reports them once and answers a curated 500 with the event id; Postgres constraint violations become CONFLICT or BAD_REQUEST. Only expected denials become 401/403/404: a catch-all never turns an outage into one.
- **Server code that handles a failure and must report it:** `captureExceptionWithScope(error, { action, procedure, requestId, context })` from `@/lib/sentry`.
- **Client code:** `reportError(error, { action: "Domain.snake_action", context })` from `@/lib/errors/client`, with ids, numbers and enums only in `context`. Query and mutation failures are reported by the QueryClient's caches; a hook whose caller reports (beside its own toast) sets `meta: { suppressGlobalErrorReport: true }`, so each failure is reported once.
- **No bare `} catch {` or `.catch(() => undefined)`** unless marked `// heartbeat: offline-tolerant`, and never Sentry's `captureException` directly (ratchets).
- **RSC pages calling `caller`** wrap a lookup in `catchNotFound(promise)` (`@/lib/orpc/catch-not-found`), never a blanket `.catch(() => null)`.

## Sentry

- **Inert without a DSN.** `NEXT_PUBLIC_SENTRY_DSN` unset: nothing initialises, every capture helper returns `null`, and the build needs no Sentry credentials. Source maps upload only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are set at build time.
- **Two runtimes, one options module.** `sentry.server.config.ts` (loaded by `register()` in `src/instrumentation.ts`, Node only) and `instrumentation-client.ts` both take their settings from `src/lib/sentry-options.ts`, the only place they are testable. There is no edge config: the proxy runs on Node and no route declares the edge runtime.
- **Environments come from the branch** (`resolveSentryEnvironment`). The production deployment (branch `main`) and the `qa` one report as `production` and `qa`. Any other Vercel preview never initialises, so a dead branch cannot keep an issue open. Local, CI and Docker report under `NODE_ENV` when a DSN is set.
- **Live production is `isProductionDeploy()`** (`src/lib/env/deploy.ts`, `VERCEL_ENV === "production"`), never `NODE_ENV`: every `next build` runs with `NODE_ENV=production`, previews and `qa` included.
- **Privacy:** `sentryDataCollection()` spells out what leaves the process: no user identity, cookies, request bodies, client IPs, query values, database query values or AI prompts. Replays record only around an error, with all text, inputs and media masked. Changing any of these is a privacy review, not a tweak.
- **Every event is scrubbed** by `scrubEventSecrets`, which runs `sanitizeForLog` (`src/lib/redaction.ts`) over the whole event: a new egress goes through the same function, never a copy of its rules.
- **Build options are the Turbopack spellings** (`_experimental.vercelCronsMonitoring`, `_experimental.turbopackReactComponentAnnotation`); `webpack.*` options do nothing under `next build`. Re-check them on a `@sentry/nextjs` bump.
- Browser events go through the `/monitoring` tunnel on the app's own origin.

## What is an issue

An issue is something a developer must fix. Everything else is a breadcrumb or nothing.

- **Not an issue:** a typed business `ORPCError` (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`), matched by code and never by message; crawler traffic; Next's streamed `notFound()`/`forbidden()`/`unauthorized()` (digest `NEXT_HTTP_ERROR_FALLBACK;401|403|404`); an error raised entirely inside a browser extension.
- **Is an issue:** anything else the server could not handle, and any client failure that is not one of the above.
- A new noise filter matches the observed signature positively (a code, an exact digest, a frame URL) and gets a test. Never filter by exclusion ("every `TypeError` except…"): it hides the next real failure.
- Better Auth's error-level log lines reach Sentry through `betterAuthLogger`, once per incident (the underlying error, never Better Auth's `APIError` wrapper).

## Logging

- **One wide event per request** (evlog, `src/lib/evlog.ts`). A route handler is wrapped in `withEvlog`; `/api/orpc` and `/api/health` are. `src/proxy.ts` stamps `x-request-id` on every `/api` request and does nothing else: no database, no auth decision.
- **Add to the event, don't print:** `safeRequestLogger()?.set({ post: { op: "create", id } })` from `@/server/api/utils/logger`. It is `undefined` outside a wrapped request (the RSC `caller`, scripts, tests), so the call is safe anywhere. No `console.log` per call; the timing middleware already records `{ orpc: { procedure, durationMs } }`, and the error interceptor the `outcome`.
- **Ids, enums, counts and booleans only.** Never spread a request body, form values or a row into the event; never log free text a user typed. Namespace each domain under its own key (`post: { … }`) and never set a key evlog reserves (`audit`, `status`, `level`, `service`, `duration`, `durationMs`).
- **Redaction runs before the console write:** `redact.transform` is `sanitizeForLog`, on top of evlog's built-in masks. A new drain or transport reuses it.
- Output: pretty under `next dev`, one JSON line elsewhere, which Vercel's runtime logs keep. `next dev` also writes `.evlog/logs/` (gitignored), which the `analyze-logs` skill reads. Shipping events to Sentry Logs needs a drain _and_ head sampling, added together: a drain without sampling floods the quota.

## Background work and health

- **Side work after the response** (a webhook, an email, a broadcast) is neither awaited inline nor left as a floating promise, which Vercel may freeze mid-flight: wrap it in `keepAlivePastResponse(promise, { action })` (`src/server/api/utils/keep-alive-past-response.ts`). It registers with `after()`, falls back to `waitUntil` outside a request scope, bounds the wait and reports a failure or an overrun.
- **`GET /api/health`** answers `{ db: "ok" }` after one `select 1`, or 503, never cached. It serves only `healthRouter`, never `appRouter`, and builds no session. With `HEALTH_SECRET` set, callers present it as a bearer token or `?secret=`. Probes make one attempt: retries hide the outage they exist to see.
