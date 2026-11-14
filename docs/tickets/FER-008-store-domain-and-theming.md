# FER-008 Store domain, routing by path and theming

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-002, FER-005

## Goal

A store is a row in the database. Its public pages live under `/{storeSlug}` and wear that store's colors.

## Scope

- Tables `store` and `store_translation` as in the data model, with migration and seed (Lucas's store).
- `src/server/services/store.ts` and a `store` router: get by slug (public, active stores only), plus the reads the layout needs.
- Routes `/{store}` and `/en/{store}`; an unknown or inactive slug is a 404. `/` redirects to the slug in `DEFAULT_STORE_SLUG`.
- Reserved slugs that can never be a store: `admin`, `api`, `en`, `design`, and Next's own paths. Enforced in the zod schema and by a database check.
- Theming: the store layout writes the five store colors as CSS variables over the storefront tokens. Colors are validated as hex on write, and a pair that fails AA contrast is rejected with a clear message.
- Store data is cached and invalidated by tag when the store is edited.

## Out of scope

The admin screens that edit a store (FER-014). Custom domains per store.

## Acceptance criteria

- Two seeded stores with different palettes render differently at their own paths in the same deployment.
- A reserved or duplicate slug cannot be saved through the API or directly in the database.
- Unit, integration and e2e tests cover resolution, 404 and theming.

## Notes

Every later query for catalog, orders or metrics filters by `storeId` taken from the resolved store, never from client input alone.

## Outcome

Decisions taken on the way:

- **`/` still shows the template's sign-in and feed.** Lucas chose to leave it until the admin exists, so the redirect to `DEFAULT_STORE_SLUG`, and that variable, moved to FER-013, which gives sign-in its own address.
- **Stores can be written through the API** (`store.create`, `store.update`) by any signed-in user, everywhere but production: the live deployment refuses both until roles exist. Roles arrive with FER-009, which swaps in its procedure builders and removes that gate. On QA, where sign-up is still public, anyone who signs up can edit a store until then.
- **An edit sends the whole store,** texts included. The five colors only make sense together, and a partial update would have to merge with a row read earlier.
- **A message under a field is the form's job.** The API answers a refused store with `BAD_REQUEST`; the wording ("…has a contrast of 4.46:1. It needs at least 4.5:1") lives in the schema the settings form will validate with (FER-014), where it also gets its Spanish.
- **AA is checked on nine pairs:** the five the storefront sets text in, plus the muted colors CSS derives from the palette on each color they sit on (`design.md` § Storefront).
- **Social links are held to their own site** (`instagram.com`, `tiktok.com`), every link to `https`, and none may carry a user name: they end up in an `href`.
- **The store home is fully static per address,** rendered on the first visit and kept until the store is edited. That is what makes an unknown address a real 404 instead of a 200 showing the not-found page (`docs/agents/nextjs.md` § Store pages and cached reads).
- **The seed adds two stores,** `lr-market` (the working name, default palette) and `tienda-demo`. It is refused in production, like the rest of the seed: QA gets its stores by running `pnpm db:seed` against its database, and production through the admin (FER-014).
- **The home's content is a placeholder:** name, tagline and description in the store's colors. The shell is FER-021 and the real sections FER-022.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
