# FER-019 Article list and quick edits

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** in progress
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

## Decisions

Lucas's, on 2026-11-18, looking at FER-017's simple list ("la página está bien"):

- **Numbered pages, on the server, replace the infinite scroll** the scope above names: `?page=2` in the address, the server answers one page and how many match (counted up to 10.000, "más de 10.000" past it), the foot says "1–24 de 137" with the steps and the page numbers (a gap for the pages left out; "Página 2 de 6" between the steps on a phone). Following a page focuses the table, named by the list and described by its range. A page past the last (an old link) says so and offers the first page. `product.list` lost its cursor.
- **Search and filters in a side panel, in Vercel's quiet style.** A toolbar: the search by title (either language, blind to case and accents, wildcards literal, `?q=`, the address following once typing pauses without adding history), "Filtros" (outlined, with the count of active values) and, below `xl`, "Ordenar". "Filtros" opens a sheet from the right (the whole screen on a phone): status and availability as segmented controls, the categories (a group above its categories; a group's slug stands for all of it), the store's own filters as pills with their swatches, several values each. **Apply on confirm**: nothing changes while choosing, the foot says how many articles the choice would show, "Limpiar" empties the choice, "Aplicar" puts it in the address as one history entry; closing drops it. On a phone the sheet covers the list, so live changes behind it would be invisible and every tap a history entry. The active values show as chips over the list, each a link without it, and "Limpiar todo".
- **The address holds it all**: `q`, `status`, `availability`, `category=a,b`, a store filter as `f.<filter>=<value>,<value>` (the prefix keeps a filter named like one of the list's own parameters from taking it), `sort` and `dir`, `page`; defaults are left out, so one selection is one address. A slug the store does not have is ignored, by the screen and by the API, as the storefront ignores an unknown filter value: an old bookmark filters less, never fails. Malformed input is dropped by the page and refused by the API.
- **Sorting by column** (Lucas, the same day): the headers of the computer's table sort (title and category in the page's language with the row's own fallbacks, price, status, last change), an arrow on the active one, a second click turning it round, `aria-sort` on the header; "Ordenar" offers the same on a phone. Applied in SQL before the page, the id breaking ties. An article without the key (no title, no category, no price) comes last both ways. Availability is not a column of its own: the filter covers it. Changing the order, a filter or the search goes back to page 1. The default stays the most recent change first.
- **A row is a table row**: the title is the one link, stretched over the row; a column "Modificado" ("hace 2 horas") from `xl` up, where the table starts (below it, beside the sidebar, the columns left the title no room).

Still to do in this ticket: inline actions (availability, price, publish, duplicate, delete), bulk edit, "share this selection", reordering by position.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
