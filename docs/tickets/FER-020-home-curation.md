# FER-020 Home curation: banners, ranking, featured

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-016, FER-011

## Goal

The store decides what its home shows: the promo banners, the "best sellers" list and the featured articles.

## Scope

- Tables `banner`, `banner_translation`, `ranking_entry`, `featured_product`, with services and store-scoped routers.
- Banners: image upload with a mobile and desktop crop preview, title, subtitle and button label in both languages, link (an article, a category or a URL), order, active switch, optional start and end dates.
- Ranking: pick articles and order them, up to ten. This list is curated by hand and labelled "best sellers" on the storefront; it is not computed from orders.
- Featured: pick two to four articles for the large highlight slots.
- A preview of the home with the current choices before saving.

## Acceptance criteria

- A banner outside its date range disappears from the storefront without anyone touching it.
- An article that becomes unavailable or unpublished drops out of ranking and featured on the storefront, and the admin shows a warning beside it.
- E2E: add a banner, build a ranking, see both on the home.

## Notes

The fair banners ("find us at the fair, December 5 to January 5") are content created here in FER-031, not code.

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
