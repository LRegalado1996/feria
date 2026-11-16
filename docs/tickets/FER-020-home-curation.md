# FER-020 Home curation: announcement, banners, rows

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-016, FER-011, FER-040

## Goal

The store decides from `/admin/home` what its home shows, so an update is a few taps: the announcement bar, the photo banners, and the rows of articles between them.

Rewritten on 2026-11-16 to the structure of the reference store ([FER-039](FER-039-storefront-redesign.md)).

## Scope

- Tables `announcement`, `banner`, `ranking_entry`, `featured_product` and their translations, with services and routers.
- **Announcement bar:** one line of text in both languages, an optional link, an active switch, optional start and end dates. First content: "Encontranos en la feria, del 5/12 al 5/1".
- **Banners:** a photo with a phone and a computer crop preview, title and button label in both languages, link (an article, a category or a URL), active switch, optional start and end dates. Each banner has a position in the home: the first is the cover on top, the others sit between rows.
- **Rows:** the home's rows of articles are the store's categories (those with published articles), in an order chosen here, plus two curated ones: "best sellers" (pick and order up to ten; curated by hand, not computed from orders) and "featured" (two to four).
- A preview of the home with the current choices before saving.
- Built in the admin shell and cards of FER-040, and comfortable on a phone.

## Acceptance criteria

- A banner or an announcement outside its date range disappears from the storefront without anyone touching it.
- An article that becomes unavailable or unpublished drops out of the curated rows on the storefront, and the admin shows a warning beside it.
- E2E: set the announcement, add a banner, build a ranking, see all three on the home.

## Notes

The fair banners ("find us at the fair, December 5 to January 5") are content created here in FER-031, not code.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
