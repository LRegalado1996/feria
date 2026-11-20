# FER-016 Category management

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-013, FER-010

## Goal

A store member keeps the store's categories in order without leaving the page.

## Scope

- One screen: list, add inline, rename in both languages, reorder by drag (with keyboard and button alternatives), delete.
- The English name is suggested from the Spanish one and stays editable.
- Deleting a category that has articles asks where to move them; it never leaves an article without a category.
- The article count per category is shown.
- Order here is the order of the sliders on the home and the filter in the catalog.

## Acceptance criteria

- Reordering persists and shows on the storefront without a redeploy.
- A duplicate name in the same store is refused with a message on the field.
- E2E: create, reorder, delete with reassignment.

## Outcome

- `/admin/{store}/categories` (`organisms/category-manager`): add inline, rename (the Spanish name required, the English one optional and shown as the Spanish one where empty, as Lucas chose), reorder by dragging the handle (`@dnd-kit`, a short press on touch so a swipe still scrolls) or with the up and down buttons, and delete. A category with articles asks which category they move to (`molecules/delete-category-dialog`); the only category with articles cannot be deleted. The article count per category includes drafts.
- `category` router (`list`, `create`, `rename`, `reorder`, `delete`) through `storeProcedure` and the access re-check in the write's transaction; `src/server/services/category.ts` serializes a store's category writes with an advisory lock. A Spanish name the store already has, ignoring case and accents, is refused with CONFLICT and shown on the field. A category's slug comes from its Spanish name and never changes on a rename, so shared catalog links keep working.
- The storefront reads the order from `catalog.categories`, uncached today; when FER-023 caches it, `reorder`, `rename`, `create` and `delete` invalidate that cache.
- E2E (`src/e2e/tests/admin/categories.e2e.ts`): create with the duplicate refusal, reorder with the buttons and by dragging (kept after a reload and in the storefront's read), delete with reassignment, another store's page not found.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
