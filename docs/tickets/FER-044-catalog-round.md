# FER-044 Catalog round: header, catalog pages, footer and a fuller seed

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-043, FER-011 (stacked after them)

## Goal

The store reads like the reference shop from the first screen: a short header in Lucas's order, a catalog page that opens on a photo the width of the window, a grid that keeps loading as the shopper scrolls, and a footer that tells who is behind the stall. Enough sample articles to see all of it.

Asked by Lucas on 2026-11-18, after reviewing the store by hand; the decisions below are his. The visual reference stays https://landonorris.store (structure and feel, never its logo, photos or licensed typeface).

## Scope

**Header**

1. The left side reads "Catálogo", "Burbujeros", "Bijouterie", in that order: Bijouterie is always last, in the header and in the footer. "Catálogo" ("Catalog") replaces "Todos los artículos" as the label of the all-articles page. The order of groups and categories comes from their positions in the admin, so the seed sets it; nothing hard-codes it.
2. The dropdown's arrow on "Bijouterie" takes too much room: drawn like landonorris.store's currency selector, a small chevron tight against the word, one control. Still accessible as it is today: `aria-expanded`, keyboard, Escape, focus returned, a 44 px target, and working before the page's script loads.
3. The right side of the header stays exactly as it is.

**Catalog pages** (all articles, each group, each category)

4. The cover is full-bleed: the whole width of the window, attached to the header with no gap, and nearly a full screen tall, with the first row of articles still hinting below the fold on a phone and a computer. The page's title stays the `h1` over the cover; the cover stays the page's priority image, with art direction (the phone image below `md`). The heights are recorded in `design.md`.
5. The breadcrumb moves below the cover, and its first item is a house icon (lucide `House`) named "Inicio" / "Home" instead of the word.
6. No visible description paragraph and no share button on a catalog page. The description keeps feeding the meta description, Open Graph and JSON-LD. The share button's component stays (the article page is another branch's).
7. "Ordenar por" has four options: the default, the order Lucas chooses, shown as nothing selected (the control reads just "Ordenar por"); price, low to high; price, high to low; newest. The default needs a manual order: a `position` on articles (schema change approved by Lucas), backfilled in creation order, a new article last; the keyset pagination's `ORDER BY` ends in a unique key and the cursor carries all of it. Reordering in the admin is not in this ticket: [FER-019](FER-019-article-list.md) sets it, and [FER-017](FER-017-article-wizard.md) gives a new article the last place.
8. Filters: with filters chosen, only how many shows, on the "Filtrar" control ("Filtrar (2)", with an accessible name that says it). The black pills under the filters go.
9. Infinite pagination: as the shopper nears the end of the list, the next page loads by itself (IntersectionObserver). A real "Cargar más" link stays for visitors without script and for crawlers; loads are announced politely; focus stays sensible; the footer stays reachable once the list ends; the first page stays in the HTML for crawlers that run no script.
10. The seed holds about 50 articles over the categories, with realistic names and prices in Uruguayan pesos; every description three short paragraphs in Rioplatense Spanish and in English (what it is, the material or finish, how to wear, use or gift it; no invented claims, certifications or materials); about 25 more free photos (Unsplash or Pexels, of jewelry and bubble toys), resized to at most 1600 px wide and credited like the others; at least six articles with four or five photos, "Par de esclavas" and one ring among them. The seed stays idempotent.

**Footer**

11. Under the logo, instead of the tagline, a short personal story in the first person, signed "Pepe", from `src/content/{es,en}`. [FER-014](FER-014-store-management.md) (company settings) may make it editable later. The tagline keeps its other uses.
12. The footer's "Tienda" column lists only Catálogo, Burbujeros and Bijouterie (groups and categories in no group, not every category), in the header's order. "Ayuda" stays as it is.

## Out of scope

- Reordering articles in the admin: FER-019.
- The article page, its gallery, the cart, its drawer and the checkout: another branch works on them in parallel.
- Making the footer's story editable: FER-014 may.

## Acceptance criteria

- The header shows "Catálogo", "Burbujeros", "Bijouterie" from the database's order, the same order in the phone menu and the footer's shop column; the group is one control, a chevron tight against its name, that opens with the keyboard, closes on Escape handing focus back, is 44 px tall, and leads to the group's page before the script runs.
- A catalog page with a cover shows it from edge to edge right under the header, the breadcrumb under it starting with a house named "Inicio", no description paragraph and no share button, and a hint of the first row of articles at 390×844 and 1440×900.
- The sort menu has the four options; with the default the control reads "Ordenar por", no option is marked, and the grid follows the articles' `position`.
- With two filter values chosen the control reads "Filtrar (2)" and says so to a screen reader; no pills show.
- Scrolling to the end of the grid loads the next page by itself and says so politely; "Cargar más" is a link to the next page that works with scripts off; once the list ends the footer is reachable.
- `pnpm db:seed` on an empty database gives about 50 published articles, six or more with four or five photos.
- E2E covers the sort options, the filter count, the infinite load and the link with scripts off, the breadcrumb's home icon and the header's order.

## Decisions

## Outcome

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
