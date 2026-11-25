# FER-083 The production errors Sentry holds

- **Milestone:** M6 Launch
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-032

## Goal

Every error production reported is understood, and each one is fixed or explained, before the fair.

## The problem

Found on 2026-11-25 while checking for FER-032 that Sentry receives production errors. It does: project `feria`, environment `production`, 85 error events between 2026-11-21 and 2026-11-24, all unresolved:

- Database queries that failed under an admin request: the session read (`FERIA-4`, `FERIA-7`), the user read (`FERIA-5`, `FERIA-8`, 36 events), the store read (`FERIA-G`, `FERIA-H`), a rollback (`FERIA-B`), "server conn crashed?" (`FERIA-A`), and "Failed to get session" (`FERIA-3`, 22 events). Their culprits are `POST /admin/settings`, `/admin/categories`, `/admin/products`, `/admin/users` and `/admin/metrics`, the admin's server-side calls. They look like dropped database connections (Neon's pooler, a function's idle connection), not wrong queries.
- A hydration error on the storefront (`FERIA-6`, 17 events, last on `/bijouterie`).

## Scope

- Read each issue's events and breadcrumbs; find the cause. For the database: the pool's settings against Neon's pooled endpoint and Fluid Compute's reused instances, and whether a dropped connection is retried.
- The hydration error: which element differs between server and browser.
- Fix what is a bug, with tests; resolve each issue in Sentry with a note saying why.

## Acceptance criteria

- Each issue listed above is investigated: its cause is written in its Sentry note, and it is fixed here or resolved with the reason it needs no fix. A ticket of its own is allowed only for a fix too large for this one, and it names the cause.
- No unresolved production issue in Sentry without a note.

## Done (2026-11-25)

Twenty issues were open, not ten: the count grew while the ticket waited. Every one has a note in Sentry with its cause.

| Issues                                                                                  | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Fix                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FERIA-3`, `-4`, `-5`, `-7`, `-8`, `-9`, `-D`, `-E`, `-F`, `-G`, `-H`, `-J` (80 events) | The connection, never the query. Three shapes: a new connection that did not open (the pool's 10-second connect timeout, "Connection terminated due to connection timeout"; Neon's proxy answering "Authentication timed out"), a socket closed under the request ("Connection terminated unexpectedly"), and a write into a connection the platform had suspended with the instance ("write ETIMEDOUT"). Nothing retried the connection, so the request's first query failed, whichever it was: the session read, the login re-read, the store read. | PR #94: `ResilientPool` retries a connection that failed to open, no `min` connection outlives a suspension, and a session that cannot be read no longer fails a public page. No event since it reached production on 2026-11-25. |
| `FERIA-A`, `-B` (2 events each, always together)                                        | The pooler ended a connection in the middle of the admin list's transaction ("server conn crashed?", 08P01). A client in use had no `error` listener (pg-pool listens only while one is idle), so Node threw the error as an uncaught exception, fatal to the whole instance; the request then failed again on its rollback.                                                                                                                                                                                                                          | Here: every connection gets an `error` listener for life (`Db.client_error`, a breadcrumb). The request whose connection died still fails and is still reported, once.                                                            |
| `FERIA-C` (4 events, one moment)                                                        | A cold server's first connection hung, and the storefront switch waited 5 seconds, as long as one connection attempt: the read was given up before any retry could save it, and the switch answered "closed".                                                                                                                                                                                                                                                                                                                                         | Here: an attempt is cut at 3 seconds and the switch waits 7, which leaves the retry and the read close to four. The store is open now (FER-032), so a wrong "closed" would show a customer the coming-soon page.                  |
| `FERIA-6` (17 replays, 21 events Sentry's hydration filter dropped)                     | Chrome for Android has no symbol for the Uruguayan peso (its ICU keeps the largest economies' currencies only), so it wrote `UYU 1.290` where the server had written `$ 1.290`. Every page that formats prices again in the browser (the catalog's grid, the admin's article list) failed to hydrate on an Android phone, and showed `UYU`. Checked on Chrome in an Android emulator.                                                                                                                                                                 | Here: `formatPrice` spells Spanish's signs itself and asks `Intl` only for the ISO code, which every runtime writes alike.                                                                                                        |
| `FERIA-K`, `-M` (13 events)                                                             | An article's share card fetched its photo outside any cache, which stops a prerender under Cache Components: the card answered 500.                                                                                                                                                                                                                                                                                                                                                                                                                   | PR #97 (FER-049), in production since 2026-11-25.                                                                                                                                                                                 |
| `FERIA-1`, `-2`                                                                         | The deliberate errors of FER-003, from development and QA.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None needed.                                                                                                                                                                                                                      |

Decided by Lucas on 2026-11-25: when the database cannot answer at all, the store keeps leading to the coming-soon page that already exists ("si se cae que redirija a la coming soon que ya existe"). That is what the switch does, so nothing changes: it fails closed, for five seconds at a time, and reports it.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
