# FER-019 Article list and quick edits

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-017

## Goal

A store member finds any article quickly and makes the common changes without opening it.

## Scope

- List with cover, title, category, price, status and availability; cards on mobile, a table on desktop.
- Search by title, filters by category, status, availability and the store's own filters (FER-033), all in the URL.
- "Share this selection": with a category or filter applied, one button copies the matching storefront link or opens WhatsApp with it, so the owner answers "what do you have in purple?" in two taps.
- Bulk edit: select several articles and add or remove a filter value, for tagging the existing catalog quickly.
- Inline actions: toggle available, edit price, publish or unpublish, duplicate, delete with confirmation.
- Infinite scroll on the template's keyset pagination.
- The primary action is always "new article", leading to the wizard.

## Acceptance criteria

- Marking an article unavailable from a phone takes two taps and shows on the storefront at once.
- Deleting removes the article's images (FER-011) and keeps past orders intact (they hold their own copy of title and price).
- E2E: search, toggle availability, change a price, delete.

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
