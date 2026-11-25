# FER-083 The production errors Sentry holds

- **Milestone:** M6 Launch
- **Priority:** P1
- **Status:** todo
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

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
