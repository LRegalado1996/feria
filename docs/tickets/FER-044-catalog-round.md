# FER-044 Catalog round: header, catalog pages, footer and a fuller seed

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
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

- **The default order's name in the menu is "Destacados" ("Featured")**, as the reference store's "Featured". Chosen, the button reads only "Ordenar por" and no item is marked. The address never writes it (`?sort=position` is read, never written), so the plain address is the store's order.
- **A new article's place comes from a database sequence** (`product_position_seq`, the column's default), not `max() + 1`: two articles added at once never share a place, and every writer (the service, the seed, a test, the build a deploy replaces, which names no position) gets one. Migration 0016 is expand only: it numbers the articles already there per store in the order they were created (`createdAt`, then `id`), after any already placed, starts the sequence after the last, then sets the default and `NOT NULL`. The list orders by (`position`, `id`) and its cursor carries both; a reorder (FER-019) may give two articles one place, the id still breaks the tie.
- **The filter count counts the filters' values only.** A category is a page of its own since FER-043, and a search is not a choice of the panel, so neither counts: `/bijouterie/anillos` reads "Filtrar", `?color=dorado,plateado` "Filtrar (2)".
- **The cover's height is the window's less what must still show** (`svh`): 17.5rem on a phone, 20rem from `md` up, never under 20rem. At 390×844 that is 564 px of photo and about 70 px of the first row in the first view; at 1440×900, 580 px and about 90 px. `design.md` records them.
- **The page size stays 24.** The next page starts loading when the grid's end is 800 px below the window, about two rows of cards on a phone, so it is usually there before the shopper reaches the last row.
- **A later page is `?cursor=`, the sort's key, a dot and the id** (`120000.48`; a date as its milliseconds). It is what "Cargar más" leads to without the script; it is `noindex, follow`, its canonical the list's first page, because its articles move as the store orders them and each has its own page. A cursor that does not read is the first page.
- **On the header's line the group is a link before the script runs and a button after**, in the same box: the link leads to the group's page, the way in without the script; the button's list starts with that page ("Ver todo") since the control no longer leads there. The phone menu keeps its row, the name a link and a 44 px button beside it: the room it takes there is the menu's.
- **The seed** holds 49 articles (7 bubble toys, 9 chains, 12 rings, 11 earrings, 10 bracelets), created one category after another in turn, so the default order mixes them. Its 39 photos are fewer than its articles: a size or pack variant, or a piece another photo also shows, reuses one, and seven articles (the bangle pair and the halo ring among them) have four or five. The descriptions say a tone or a finish ("de tono dorado", "estilo perla"), never a material: the photos are stock photos, so the earlier "baño de oro" and "de plata" went too.
- **The seed fills an empty catalog only, as before.** A database seeded before keeps its eleven articles and its order, Bijouterie first: the categories screen (`/admin/categories`) reorders them, or a fresh database gets everything. A catalog seeded before groups gets its Bijouterie last, after the bubble guns.
- **The footer's story in English:** "For more than 20 years my family has set up its stall at the Christmas fair. I started out helping my parents, and for about 10 years now I have had my own. We have sold a bit of everything: shoes, clothes, toys, perfumes. This year we are bringing jewelry and bubble guns: come by stall 86 or order from here." Signed "Pepe".
- **The article page's trail still says "Todos los artículos"** (`storefront.article.catalog`): the article page belongs to the branch working on it in parallel, which can rename it to "Catálogo" there.

## Outcome

- **Data** (migration 0016, expand only): `product.position`, its default the next number of `product_position_seq` (int4), backfilled in creation order, with the index (`storeId`, `status`, `position`, `id`); its integration test replays it, keeps a place already set and puts a new article last.
- **Catalog API:** `position` is the default sort (`DEFAULT_PRODUCT_SORT`), the menu's order the default, both prices and the newest; its keyset cursor carries the place and the id. `readCatalogCursor` and `cursorParam` read and write a cursor in an address.
- **Header:** "Catálogo" ("Catalog") for the page of all articles; the line reads the groups and the categories in no group in their positions' order; `molecules/store-nav-group` on the line is one control, the name with a 12 px chevron, a link before the script runs and a disclosure button after, its list starting with "Ver todo".
- **Catalog pages:** the cover is full-bleed and nearly a screen tall; the trail is under it and starts at a house named "Inicio"; no description paragraph and no share button (the description still feeds the metadata and the JSON-LD); "Filtrar (2)" with its whole name for a screen reader, and no pills; the sort's default reads "Ordenar por"; the grid loads its next page by itself near its end, says each page in a polite `output`, stops at the end; "Cargar más" is a real link to `?cursor=`, loaded in place with the script.
- **Footer:** Pepe's story under the logo, signed; "Tienda" lists the catalog and the header's entries only.
- **Seed:** 49 articles with three-paragraph descriptions in both languages, seven with four or five photos; 28 more photos in `public/seed/` (26 from Unsplash, 2 from Pexels), credited in `docs/brand/seed-photos.md`; the bubble guns before the Bijouterie group.
- **E2E:** `tests/store/catalog.e2e.ts` (the default order follows the positions and marks nothing, "Filtrar (2)" with no pills, the pages loading by themselves with the footer in reach, "Cargar más" without the script, no description or share button), `tests/store/catalog-pages.e2e.ts` (the cover edge to edge under the header, its height and the first row in sight at 1440×900 and 390×844, the trail's house, the header's one control by keyboard and without the script, the header's and the footer's order following the positions), and the shell, filters and settings specs on the new words.
- **Docs:** `design.md` § Storefront, `docs/agents/nextjs.md`, `docs/project/data-model.md`, `docs/project/overview.md`, `docs/brand/seed-photos.md`, `README.md`, [FER-017](FER-017-article-wizard.md) and [FER-019](FER-019-article-list.md).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
