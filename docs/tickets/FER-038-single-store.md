# FER-038 One store, one admin role

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-012, FER-027

## Goal

The site is one store, LR Market. The company's details still live in one database row, so taking this project to another company is a new deployment with its own row and its own theme file, not a second store in this one.

Decided by Lucas on 2026-11-16, replacing the multi-store decision of 2026-11-13.

## Scope

- **Addresses lose the store.** `/` is the home, then `/products`, `/products/{slug}`, `/cart`, `/orders/{token}`; English under `/en`. The admin is `/admin/sign-in`, `/admin` (opens the orders, as Lucas chose) and `/admin/{products,categories,filters,orders,home,settings,users,metrics}`. No `/{store}` segment, no `/admin/{store}`, no `/admin/platform`.
- **The `store` table stays, with exactly one row** (the database refuses a second). Every catalog, order and metrics table keeps its `storeId`. The code reads "the store" through one cached read; nothing takes a store from the address or from input.
- **Gone from the store:** `slug` and its reserved-path check, `isDefault`, `isActive`, `logoUrl` and the five color columns. Follow expand then contract (`docs/agents/database.md`): the columns are `NOT NULL` today, so this ticket's migration first makes them nullable (or drops the checks that require them), and only then does the code stop reading and writing them; the columns are dropped in a later ticket, once no deployed build reads them.
- **Colors are code.** The palette lives in one theme file of named variables, the only place another company would edit. The contrast rules that `store.update` enforced become a unit test over that file. The layout no longer injects colors from the database.
- **Currency stays a setting** of the store row: pesos or dollars.
- **One role, `admin`.** Every login is an admin and reaches everything. `user.role` stays as a column so later roles have a home; `store_member` goes, since every admin belongs to the one store. Procedure builders collapse to `publicProcedure` and one admin builder.
- **Admin shell:** no store switcher, no platform area, no "pick a store" or "no store" landing. One list of sections.
- **Cart:** one cart per browser (the storage key loses the slug).
- **Seed:** one store (LR Market) and its catalog; `tienda-demo` and the member and multi-store logins go.
- **Coming-soon switch** (FER-034) keeps working over the new addresses.
- **Docs:** `docs/project/overview.md`, `docs/project/data-model.md`, `docs/agents/nextjs.md` § Store pages and § Admin pages, `docs/agents/security.md`, `AGENTS.md`.

## Out of scope

How the storefront and the admin look (FER-039, FER-040). The settings screen (FER-014).

## Acceptance criteria

- No route, procedure input, cache tag or storage key carries a store slug.
- A second `store` row cannot be inserted, through the API or directly in the database.
- An anonymous visit to any `/admin` page ends at sign-in and returns afterwards; any signed-in login reaches every section.
- Old addresses (`/lr-market/...`, `/admin/lr-market/...`, `/admin/platform/...`) answer 404: nothing was ever published under them.
- Unit, integration and e2e suites pass on the new addresses; `pnpm verify:ci` passes.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
