# FER-019 Article list and quick edits

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-017, FER-040

## Goal

An admin finds any article quickly and makes the common changes without opening it.

## Scope

- At `/admin/products`, in the admin shell and cards of [FER-040](FER-040-admin-redesign.md). List with cover, title, category, price, status and availability; cards on mobile, a table on desktop.
- Search by title, filters by category, status, availability and the store's own filters (FER-033), all in the URL.
- "Share this selection": with a category or filter applied, one button copies the matching storefront link or opens WhatsApp with it, so the owner answers "what do you have in purple?" in two taps.
- Bulk edit: select several articles and add or remove a filter value, for tagging the existing catalog quickly.
- Inline actions: toggle available, edit price, publish or unpublish, duplicate, delete with confirmation.
- Infinite scroll on the template's keyset pagination.
- Reorder the articles by dragging them or with up and down arrows, as the categories are (FER-016): it sets `product.position`, the store's own order, which the catalog shows by default ([FER-044](FER-044-catalog-round.md)). The server takes the whole order or refuses it, as the categories' reorder does, and drops the catalog's cache (`writeToCatalog`).
- The primary action is always "new article", leading to the wizard.

## Acceptance criteria

- Marking an article unavailable from a phone takes two taps and shows on the storefront at once.
- Deleting removes the article's images (FER-011) and keeps past orders intact (they hold their own copy of title and price).
- E2E: search, toggle availability, change a price, delete, reorder (and the catalog follows the new order).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
