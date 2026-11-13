# Security

Detail behind `AGENTS.md` § Safety and permissions. Read it before you add a procedure, send user text to a new sink, or touch `src/server/better-auth/`.

## Authorization

`protectedProcedure` proves the caller is signed in, nothing more. Every procedure that touches a resource authorizes it on the server.

- **Scope ids are attacker-controlled.** An owner, tenant or parent id from input, a header or a cookie is authorized in the procedure before any query uses it.
- **Filter by owner (or tenant) and id together** (`id = $id AND ownerId = $actor`). A row the caller may not see answers NOT_FOUND; FORBIDDEN confirms it exists.
- **The actor comes from the session.** Never accept `userId`, `createdById` or a scope field from the client, and never spread input into an insert.
- **Validate ownership of every foreign key the client supplies.**
- **Empty or NULL scope never widens access.** A missing filter id rejects or returns nothing, and an empty grant set means no access: no "if empty, allow all" fallback.
- **Hiding a control is not authorization.** The server checks with the same predicate the UI uses, on every path to the capability (list, detail, export, batch) and on reads too: a figure hidden in the UI is still in the payload.
- **Re-derive a role that gates a mutation inside the write transaction,** under a row lock (resolve → lock → commit in `docs/agents/database.md`): the role in the request context is a snapshot.
- **Public URLs carry an opaque random token** in its own unique column, never a sequential id. Rotate it when the link is re-sent.
- `src/proxy.ts` stamps request ids on `/api`. If it ever redirects, it does so on session-cookie presence only, with a 307; pages and procedures do the real checks.
- Test authorization by calling the procedure as a less-privileged user. A missing ownership check found in review is fixed in the same PR.

## Encode for every sink

- **CSV:** quote every field, escape quotes and newlines, and prefix a cell starting with `=`, `+`, `-`, `@`, tab or carriage return with `'`: spreadsheets run it as a formula.
- **Email HTML:** escape every interpolated value.
- **User HTML:** a DOM-free sanitizer, never `dangerouslySetInnerHTML` on raw input.
- **Logs:** ids and enums only; every log egress goes through `sanitizeForLog` (`src/lib/redaction.ts`).

## Errors

Only expected denials become 401, 403 or 404. A catch-all must not turn an infrastructure failure (database down, limiter unreachable) into a 403 or 404: it stays a 500, where it gets reported.

## Better Auth

- **Trusted origins are exact** (`src/server/better-auth/trusted-origins.ts`): no team-wide wildcard, and production never trusts localhost.
- **Plugin routes bypass your procedures.** A plugin such as `organization` or `admin` serves `/api/auth/<plugin>/*` to any signed-in browser, with weaker checks than your procedures. Return 404 in `src/app/api/auth/[...all]/route.ts` for every route that duplicates an operation you authorize, comparing the literal pathname and allow-listing exact paths you need, and test the 404s. Server-side `auth.api.*` calls are unaffected.
- **Background hooks swallow errors.** Hooks run through `runInBackgroundOrAwait`, such as `sendResetPassword`, only log a failure and the request still succeeds: handle and report it inside the hook.
- **A 2FA sign-in returns no session.** A correct password answers `{ data: { twoFactorRedirect: true } }`: navigate only on a real session and let the client's `onTwoFactorRedirect` own the redirect. Mock that exact payload in tests.
- **Reject an ineligible sign-up in `databaseHooks.user.create.before`;** an `after` hook leaves an orphan user.

## Vendor SDKs

Some SDKs return `{ error }` instead of throwing (Resend's `emails.send`): wrap each vendor call once and throw on `error`, or a rejection reads as success.

## Rate limits

- **One shared, atomic store.** In-memory counters are per instance, so Better Auth's limiter needs `rateLimit.storage: "database"` (or secondary storage), never the default `"memory"`.
- **Sliding window for guessable secrets** (codes, PINs, passwords): a fixed window lets an attacker spend twice the budget across its edge.
- **Never one bucket for unknown clients:** one client could lock everyone out. Key by the holder of the secret, and take the IP from the platform (`ipAddress()` from `@vercel/functions`), never a raw `x-forwarded-for`.
- Security limiters fail closed; failing open on a store outage is for low-risk paths only, and logged.
- **The one switch that turns Better Auth's limiter off** is `E2E_DISABLE_AUTH_RATE_LIMIT=true`, set only in Playwright's `webServer.env` and ignored when `VERCEL_ENV` is `production` (`isAuthRateLimitDisabled` in `src/server/better-auth/config.ts`). Never set it on a deploy.

## Secrets

- **Never round-trip a masked value.** A form that loads `****1234` and saves it back overwrites the secret: keep the stored value when the submitted one equals the mask, and send secrets to the client only masked.
- **Production-only requirements check `VERCEL_ENV === "production"`,** never `NODE_ENV`: every `next build`, previews and local builds included, runs with `NODE_ENV=production`.

## 2FA recipe

For apps with privileged users (none yet; the superadmin arrives with FER-009):

- Add Better Auth's `twoFactor` plugin and require it of privileged users on the live production deploy only (`VERCEL_ENV === "production"`), so previews, qa and local stay usable.
- Enforce it in pages and in every protected procedure, not only at sign-in, and block disabling it for privileged users on production.
- Handle `twoFactorRedirect` as above.
