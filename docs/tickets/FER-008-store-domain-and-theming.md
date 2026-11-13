# FER-008 Store domain, routing by path and theming

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** todo
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

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
