# FER-077 Banners without the bottom shade: a text shadow instead

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-075

## Goal

Every banner and cover drew a dark shade rising from its bottom so the white title read on any photo. Lucas wants the photo clean: no shade on any banner, and a small shadow on the words instead.

## Decision

2026-11-24, Lucas: no shade over a photo anywhere on the storefront; the title and the "Comprar ahora" line carry a text shadow so they stay readable.

Taken while building, for Lucas to confirm:

- The shadow is one utility, `store-display-shadow` (`src/styles/globals.css`), three layers of the store's ink: a 1 px edge at 90%, a 3 px drop at 75% and an 18 px halo at 60%. The arrow beside "Comprar ahora" takes the same as a drop shadow.
- It applies to the two places that shaded a photo: `molecules/store-banner` (the home's cover, a page's cover, the banners between rows, the admin's preview) and `molecules/store-catalog-cover` (a category's and the catalog's cover). Nothing else drew a shade: the article page's festive band is a flat color.

## Known cost

On a very light photo (white or pale behind the bottom-left corner) the white words read by their outline only, at less contrast than the shade gave, and can fall under WCAG AA there. This is the trade Lucas chose. A banner's photo is chosen or cropped with something darker than white behind that corner.

## Scope

- `src/styles/globals.css`: the utility.
- `molecules/store-banner`, `molecules/store-catalog-cover`: the shade's layer removed, the words' box carries the utility.
- `design.md` (§ Storefront: type, components, what stays banned) and `docs/brand/brand.md`.

## Acceptance criteria

- No banner, cover or catalog cover paints a gradient over its photo.
- The title and the button's line of a banner, and a catalog cover's title, compute the three-layer text shadow.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
