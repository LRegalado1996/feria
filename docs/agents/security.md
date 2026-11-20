# Security

Detail behind `AGENTS.md` § Safety and permissions. Read it before you add a procedure, send user text to a new sink, or touch `src/server/better-auth/`.

## Authorization

`adminProcedure` proves the caller is a login, nothing more. Every procedure that touches a resource authorizes it on the server.

### Roles and the store (FER-009, FER-038)

- **One role, `admin`.** Every login is an admin and reaches the whole admin; the site is one store, the `store` table's one row, and the database refuses a second. `user.role` stays as a column for roles that may come later (its type becomes the single value `admin` with FER-041). Shoppers have no account. Nothing in a request names a store.
- **Nobody signs themselves up.** Better Auth runs with `disableSignUp` and `disabledPaths`, `/api/auth/sign-up/*` answers 404 in any spelling (`src/app/api/auth/[...all]/route.ts`), and the form has no sign-up mode. Logins are created on the server with `createAccount` (`src/server/better-auth/accounts.ts`): by `pnpm db:create-superadmin` for the first one (refused once any login exists), the seed, and the user screens (FER-015). The role is a Better Auth field with `input: false`, so no request can set it.
- **`adminProcedure`** is every procedure of the admin. It refuses a caller without a session (UNAUTHORIZED), validates the input, then re-reads the login from the database (the session's copy sits in a cookie for up to 5 minutes, so a removed login is refused at once) and gives the handler the store as `context.store`. Every query in the handler filters by `context.store.id`, never by a store id from the input, and every other id in the input (an article, a category, an order) is checked to belong to that store in the same query that uses it.
- **Writes re-check inside their transaction.** A procedure's check is a snapshot; a write runs its service through `withAdmin(db, userId, write)` (`src/server/services/access.ts`, through `writeToStore`), which re-reads the login `FOR SHARE` in the write's own transaction, so a removal that commits first refuses the write, and one that comes later waits for it. `src/server/api/orpc/access.integration.test.ts` holds the two-writer test.
- **Pages check too, and separately.** A page reads the session with `getSession()` (which bypasses the cookie cache) and the same services; hiding a link is not authorization (FER-013).

- **Scope ids are attacker-controlled.** An owner, tenant or parent id from input, a header or a cookie is authorized in the procedure before any query uses it.
- **Filter by owner (or tenant) and id together** (`id = $id AND ownerId = $actor`). A row the caller may not see answers NOT_FOUND; FORBIDDEN confirms it exists.
- **The actor comes from the session.** Never accept `userId`, `createdById` or a scope field from the client, and never spread input into an insert.
- **Validate ownership of every foreign key the client supplies.**
- **Empty or NULL scope never widens access.** A missing filter id rejects or returns nothing, and an empty grant set means no access: no "if empty, allow all" fallback.
- **Hiding a control is not authorization.** The server checks with the same predicate the UI uses, on every path to the capability (list, detail, export, batch) and on reads too: a figure hidden in the UI is still in the payload.
- **Re-derive a role that gates a mutation inside the write transaction,** under a row lock (resolve → lock → commit in `docs/agents/database.md`): the role in the request context is a snapshot.
- **Public URLs carry an opaque random token** in its own unique column, never a sequential id. Rotate it when the link is re-sent.
- `src/proxy.ts` stamps request ids on `/api`, and makes one access decision: whether a page request may see the store while the coming-soon page is published (FER-034, `docs/agents/nextjs.md` § Proxy). That decision rests on a session the proxy validates itself (`isAdminRequest`, `src/server/better-auth/admin-request.ts`: the token looked up in the database past the cookie cache, the login re-read), never on a cookie's presence, and fails closed (a failed check is no admin; an unreadable switch is closed). The cookie it sets for the admin's notice (`lr-store-preview`) only draws that notice and grants nothing. Every other check is per page and per procedure, and the admin and the API are never behind the switch.
- Test authorization by calling the procedure as a less-privileged user. A missing ownership check found in review is fixed in the same PR.

## Uploads (FER-011)

- **Files never pass through a function.** The browser sends a photo straight to Vercel Blob with a client token from `upload.createToken`, an `adminProcedure`: session, then the limits, then the login re-read. The server picks the pathname (`<namespace>/<purpose>/<uuid>.<ext>`) and signs the declared type (JPEG, PNG or WebP) and size into the token, so the store refuses another file; the token lapses after 10 minutes and never overwrites.
- **A stored address is the server's to trust.** A form that saves an uploaded image sends `uploadedImageSchema` (address, width, height), and the procedure checks the address with `isOwnBlobUrl(url, { ...blobStore, purpose })` (`src/lib/blob/paths.ts`) before writing it: HTTPS, this deployment's Blob host and folder, the purpose's folder, a UUID name, no query. `next/image` serves that host only (`next.config.ts`). The covers do it in `updateCategoryPage` (`resolveCover`): an image left out keeps the stored one, so a cover saved before uploads (a seed's `/seed/...` path) is never re-checked or lost, and only a new address must pass. An article's photos (FER-017) do it in `createProduct` and `updateProduct` (`planImages`, `src/server/services/product.ts`), purpose `product`: the save lists every photo by address, one the article already holds (a seed's `/seed/...` included) keeps its row, and only an address it does not hold must pass. A home banner's photos (FER-020) do it in `createBanner` and `updateBanner` (`assertOwnUpload`, `src/server/services/page.ts`), purpose `banner`, by the covers' rule; a replaced, removed or deleted banner photo is discarded after the commit (`discardBlobs`), and `banner.imageUrl` and `banner.imagePhoneUrl` are in `IMAGE_URL_COLUMNS`.
- **Only own files are deleted.** `deleteBlobs` and the orphan cleanup act on this deployment's own uploads alone (`isOwnBlobUrl`: its folder, a known purpose, a UUID name; qa, previews and local runs share a store, and a file put in the folder by hand is not one), and the cleanup reads every column in `IMAGE_URL_COLUMNS` (`src/server/services/upload.ts`), in one snapshot and whatever the case of the address's scheme, before deleting: a new image column joins that list in the same change, or its files are deleted as orphans. `deleteBlobs` also keeps a file another row still names.
- **The read-write token stays on the server** (`BLOB_READ_WRITE_TOKEN`, never `NEXT_PUBLIC_`); the browser only ever holds a client token for one file. A server without it answers `upload.createToken` with a typed `SERVICE_UNAVAILABLE` whose `why` is `ERROR_WHYS.UPLOADS_NOT_CONFIGURED` (`requireBlobStore`, FER-051), never a 500: the uploader says plainly that uploads are not configured and offers no retry, and the hook reports it once.

## Scheduled jobs

- **A cron route checks `CRON_SECRET` itself.** Vercel calls each `crons` path of `vercel.json` with `Authorization: Bearer <CRON_SECRET>`; the route compares it in constant time (`isCronRequest`, `src/server/api/utils/cron.ts`) and answers 401 otherwise. With no secret configured it answers 503 and does nothing: it never runs open. The production build refuses to start without the secret (`src/env.js`), since production is where Vercel runs crons.
- **A cron route is outside the proxy's language and coming-soon rules** (it lives under `/api`), and lives in `src/app/api/cron/<job>/route.ts`, wrapped in `withEvlog`: its log line carries the job, the outcome and counts, never a file name or a row.

## Encode for every sink

- **`href` from the database:** the store's links reach an `href`. They are validated when they are stored, by the schema: a link is `https://` only, never `javascript:`, carries no user name, and a social link stays on its own site. The home's links (FER-020: the announcement's, a banner's address) are a path of this site (`/productos`, never `//host`, which a browser reads as another site) or an `https://` address with no user name, and nothing holding a backslash or whitespace (`isSafeHomeLink`, `src/lib/schemas/page`); a site path is localized by the page (`homeHref`). A banner's link to an article or a category is its id, checked to be the store's in the write's transaction, and an article no longer published leaves the banner without a link rather than leading to a 404. The colors in a `style` attribute are constants of the theme file (`src/styles/theme.ts`), never data.
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

- **Orders** (`order.create`, FER-025): 5 an hour per phone and 20 an hour per client, counted from the orders themselves under advisory locks per phone and per client (always phone, then client, then store), at the database's clock read after the locks, answered with `TOO_MANY_REQUESTS` and its `retryAfter`. The client is a keyed hash of the platform's IP (`orderClientKey`, `src/server/api/utils/client-key.ts`), an IPv6 address by its /64 since one connection holds the whole block; with no IP (a local server) only the phone limit applies, never one shared bucket, and the request's log line says `order.clientLimit: "skipped"`. At most 20 distinct articles of at most 10 units each.
- **Bots on the checkout** (FER-026): `order.create` asks Vercel BotID (`isBotRequest`, `src/server/api/utils/bot-check.ts`) and refuses a bot with FORBIDDEN before it reads the store or writes anything. Only the closed-store check (FER-034) comes first: the cached coming-soon read and, while the store is closed, the admin's session, so a closed store answers NOT_FOUND to everyone but an admin, bot or not. The browser signs the requests listed in `src/lib/env/bot-protection.ts` (`initBotId` in `instrumentation-client.ts`); both sides run only on Vercel (`VERCEL` / `NEXT_PUBLIC_VERCEL`), since the check needs the platform's token: elsewhere it is skipped and the log line says `botCheck: "skipped"`. A request that did not come through the browser's script, the REST twin `POST /api/docs/orders` included, is judged a bot on Vercel. Basic mode needs no dashboard setting; Deep Analysis is a Firewall setting Lucas can turn on.
- **An order's page** (`/orders/{token}`) is reached by a 32-byte random token, is never indexed, and masks the phone (`maskPhone`). The admin's `order.get` (an `adminProcedure`, filtered by the store) answers the token too, so the staff can copy the link to send it again (FER-051); no public read ever does. The referrer policy (`strict-origin-when-cross-origin`) keeps the token out of the WhatsApp link's referrer.
- **One shared, atomic store.** In-memory counters are per instance, so Better Auth's limiter needs `rateLimit.storage: "database"` (or secondary storage), never the default `"memory"`.
- **Sliding window for guessable secrets** (codes, PINs, passwords): a fixed window lets an attacker spend twice the budget across its edge.
- **Sign-in** is limited by Better Auth to 10 attempts a minute per IP (the fair's staff may share one Wi-Fi) (`customRules` in `src/server/better-auth/config.ts`). Its limiter is a fixed window, so the worst case is 20 tries across a window's edge; FER-037 adds 2FA for the superadmin, the login worth guessing.
- **Never one bucket for unknown clients:** one client could lock everyone out. Key by the holder of the secret, and take the IP from the platform (`ipAddress()` from `@vercel/functions`), never a raw `x-forwarded-for`.
- Security limiters fail closed; failing open on a store outage is for low-risk paths only, and logged.
- **The one switch that turns Better Auth's limiter off** is `E2E_DISABLE_AUTH_RATE_LIMIT=true`, set only in Playwright's `webServer.env` and ignored when `VERCEL_ENV` is `production` (`isAuthRateLimitDisabled` in `src/server/better-auth/config.ts`). Never set it on a deploy.
- **The coming-soon switch has no test-only override** (FER-034): it is a row in the database, flipped only by `comingSoon.setPublished`, an `adminProcedure`, and e2e drives that same procedure and the admin's screen (`src/e2e/AGENTS.md`). No header, variable or cookie a visitor sends can open the closed store. The switch hides pages, it authorizes nothing: the API and the admin are reachable while the store is closed and check the session themselves; `order.create` refuses a closed store's orders but an admin's.

## Secrets

- **Never round-trip a masked value.** A form that loads `****1234` and saves it back overwrites the secret: keep the stored value when the submitted one equals the mask, and send secrets to the client only masked.
- **Production-only requirements check `VERCEL_ENV === "production"`,** never `NODE_ENV`: every `next build`, previews and local builds included, runs with `NODE_ENV=production`.

## 2FA recipe

For apps with privileged users (every admin, since FER-038; [FER-037](../tickets/FER-037-superadmin-two-factor.md) enables it):

- Add Better Auth's `twoFactor` plugin and require it of privileged users on the live production deploy only (`VERCEL_ENV === "production"`), so previews, qa and local stay usable.
- Enforce it in pages and in every protected procedure, not only at sign-in, and block disabling it for privileged users on production.
- Handle `twoFactorRedirect` as above.
