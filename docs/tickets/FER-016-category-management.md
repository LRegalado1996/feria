# FER-016 Category management

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
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

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
