# FER-038 One store, one admin role

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-012, FER-027

## Goal

The site is one store, LR Market. The company's details still live in one database row, so taking this project to another company is a new deployment with its own row and its own theme file, not a second store in this one.

Decided by Lucas on 2026-11-16, replacing the multi-store decision of 2026-11-13.

## Scope

- **Addresses lose the store.** `/` is the home, then `/products`, `/products/{slug}`, `/cart`, `/orders/{token}`; English under `/en`. The admin is `/admin/sign-in`, `/admin` (opens the orders, as Lucas chose) and `/admin/{products,categories,filters,orders,home,settings,users,metrics}`. No `/{store}` segment, no `/admin/{store}`, no `/admin/platform`.
- **The `store` table stays, with exactly one row** (the database refuses a second). Every catalog, order and metrics table keeps its `storeId`. The code reads "the store" through one cached read; nothing takes a store from the address or from input.
- **Gone from the store:** `slug` and its reserved-path check, `isDefault`, `isActive`, `logoUrl` and the five color columns. Follow expand then contract (`docs/agents/database.md`): this ticket stops reading and writing them; the columns are dropped once no deployed build reads them.
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

## Outcome

- **Addresses:** the storefront's pages moved from `[store]` to a `(store)` route group at the root of each language: `/`, `/products`, `/products/{slug}`, `/cart`, `/orders/{token}`, `/llms.txt`. The admin is `/admin/sign-in`, `/admin` (which sends a signed-in login to `/admin/orders`) and one static folder per section (`products`, `categories`, `filters`, `orders`, `home`, `settings`, `users`, `metrics`; the screens still to come say so). Every other address, the multi-store site's old ones included, reaches the catch-all and the store's not-found page with a real 404. No route, procedure input (REST paths included: `/api/docs/admin/...`, `/api/docs/products`, `/api/docs/orders`, `/api/docs/store`), cache tag (`store`, `catalog:<id>`) or storage key (`feria:cart`, `feria:checkout`) carries a store slug.
- **One store row.** `store` keeps `name`, the contacts, the socials and `currencyCode`; a unique index on a constant refuses a second row, through the API (there is no create procedure) or directly. Migration `0012` keeps one store (the default, else the oldest; the others' catalog and orders go with them, which on qa is `tienda-demo`), creates LR Market in pesos where there is none, and adds that index. It drops nothing the replaced build reads: `slug`, `isActive`, `isDefault`, `logoUrl` and the five colors only lose `NOT NULL` and their checks, and `store_member` stays; [FER-041](FER-041-drop-unread-schema.md) drops them. Its integration test replays it over two stores and converges.
- **Colors are code:** `src/styles/theme.ts` names the five, the root layout writes them on `<body>`, and the share cards, the icons and the logo files import them. The store's contrast rules are its unit test. The logo is the brand's (`atoms/store-logo`); `logoUrl` is no longer read, and the article's structured data names the brand logo file.
- **One role, `admin`.** `publicProcedure` and `adminProcedure` are the only builders: `adminProcedure` refuses no session, then validates the input, then re-reads the login and puts the store in the context; writes re-check the login `FOR SHARE` inside their transaction (`withAdmin`, two-writer test in `access.integration.test.ts`). `user.role` keeps its column and its two values, which nothing reads: making `admin` its only value has to wait until no deployed build tells the two apart, so it is FER-041's.
- **Admin shell:** one list of sections for every login, no store switcher, no platform area, no store picker or "no store" landing.
- **Store pages and the build:** the group's layout reads nothing from the database, so it is prerendered; each page renders the footer from the store it read, and its title through `storeTitle()`. The article and the catch-all keep `ensureStatic = "navigation"` and real 404s; the home and the cart read the store per request. The store's own share card is gone: it and the brand's would answer at the same address, and the brand's stays (`docs/agents/nextjs.md` § Store pages).
- **Seed:** the migrations' store gets its texts and the sample catalog; one login, `test@example.com`. `tienda-demo` and the member logins are gone. `pnpm db:create-superadmin` keeps its name and variables and is refused once any login exists.
- **Coming-soon switch:** unchanged in the proxy, and its e2e runs over the new addresses.
- **E2E on one store:** every spec shares the store; the `db` fixture seeds categories, articles, filters and logins into it under unique tags and deletes them, and the rows its pages create, by captured ids, never the store. A worker fixture writes one fixed set of store settings through `store.update`. What changes those settings, reorders the whole category list, or counts every order runs in the `serial` project (`*.serial.e2e.ts`, one worker, before the parallel project). The old addresses, the eight sections, `/admin` landing on the orders and the cart's one key are covered (`src/e2e/AGENTS.md`).
- **Docs:** `docs/project/overview.md`, `docs/project/data-model.md`, `docs/agents/nextjs.md` § Store pages and § Admin pages, `docs/agents/security.md`, `docs/agents/testing.md`, `docs/agents/i18n.md`, `design.md`, `docs/brand/brand.md`, `AGENTS.md`, `README.md`, `.env.example`, `src/e2e/AGENTS.md`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
