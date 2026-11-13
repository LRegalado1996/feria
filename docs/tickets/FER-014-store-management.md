# FER-014 Store management and company settings

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-013, FER-011

## Goal

Lucas can create a new store in a few minutes, and each store can keep its own details and look up to date.

## Scope

- Platform: list stores, create one (name, slug, first member), activate or deactivate.
- Store settings: name, tagline and description in both languages, WhatsApp number, Instagram and TikTok links, logo upload.
- Currency: the store picks Uruguayan pesos or US dollars. Changing it later does not convert existing prices, so the screen warns, asks for confirmation, and lists how many articles will need a new price. Past orders keep the currency they were placed in.
- Theme editor: the five store colors with pickers, a live preview of a storefront header and article card, a contrast warning that blocks an unreadable pair, and "reset to default".
- WhatsApp number validated and stored in international format.
- Saving invalidates the cached store so the storefront updates at once.

## Acceptance criteria

- Creating a store makes `/{slug}` reachable with an empty, well-designed storefront.
- A member can edit their own store's settings but cannot change the slug or deactivate the store; only a superadmin can.
- A deactivated store's public pages answer 404 and its admin stays reachable to superadmins.
- E2E: create a store, change its accent color, see it on the storefront.

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
