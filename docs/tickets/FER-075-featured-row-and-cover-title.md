# FER-075 A longer "Destacados" row and a smaller title on the cover

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-020, FER-022

## Goal

Two things Lucas asked for on the home: "Destacados" must hold more articles than four, and the white title over the cover is too big, so it wraps and competes with the photo.

## Decision

2026-11-23, Lucas:

- "Destacados" takes none, or 2 to **16** articles (it was 2 to 4). One alone is still not a row.
- The cover's title is a small caption on the bottom-left, as on the reference store's hero. Banners between two rows keep today's big title.

Taken while building, for Lucas to confirm:

- The cover's title uses the existing `store-display-section` size (18 to 28 px, a row heading's), not a new token.
- A title too long for the window **wraps** (inside a word if it must) instead of being cut with "…": the title is the link's name and the store wrote it, so no word of it is hidden. From `md` up it stops 21rem short of the right edge, where the carousel's dots and pause button are; the old 15-character cap used to keep it clear of them.
- The development seed keeps its four featured articles.

## Scope

- `FEATURED_MAX` is 16 (`src/lib/schemas/page`): the save's schema, the order form's schema and the admin's picker ("Ya hay 16: quitá uno para agregar otro.") all read it. The admin's hint and error say "de 2 a 16" in both languages.
- Migration `0027_featured_up_to_sixteen`: the check on `featured_product.position` goes from `< 4` to `< 16`.
- The storefront draws the row with the same carousel as every other row (`molecules/store-article-row`), which never assumed four: nothing to change there, the preview included.
- `molecules/store-banner`: the title's size is a variant of the banner's `size`. Only `cover` changes. The home's cover, a page's cover (`organisms/store-page`), the admin's preview and `/design` all draw it through `molecules/store-cover-carousel`, so they follow. A catalog page's cover (`molecules/store-catalog-cover`) is another component, with the category's name as the page's `h1`: untouched.
- `design.md`, `docs/project/data-model.md` and FER-020's text.

## Deploy

The migration only loosens a check (drop, then add with a higher bound, in the migration's one transaction, on a table of at most 16 rows). The previous build, still serving while it runs, writes positions 0 to 3, which the new check accepts: safe to run before the new build, no contract step owed. Rolling the build back after someone saved more than four is the one thing to watch: the old build's form would refuse that list until it is trimmed, and the storefront would keep drawing it.

## Acceptance criteria

- The admin saves 16 featured articles and refuses a 17th and a list of one; none is accepted.
- The home shows all 16 in their order in a row that pages like "Más vendidos".
- On the cover the title is 18 px on a 360 px phone and 28 px on a computer, on one line when it fits; a long title wraps and the page never scrolls sideways.
- A banner between two rows looks as before.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
