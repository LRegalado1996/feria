# FER-010 Catalog domain: categories, articles, translations

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-009

## Goal

The backend can store and serve a bilingual catalog per store.

## Scope

- Tables `category`, `category_translation`, `product`, `product_translation`, `product_image`, `product_image_translation`, with migrations.
- Services and routers:
  - Public: list categories, list published articles with keyset pagination, category filter and text search, get one article by slug, related articles from the same category.
  - Store-scoped: create, update, publish, unpublish, toggle availability, delete, reorder images.
- Slugs generated from the Spanish title, unique per store, stable after first publish.
- An article is `draft` until it has at least one image, a category, a price and a Spanish title. English falls back to Spanish when a translation is missing.
- Prices are integers in minor units of the store's currency (`UYU` or `USD`); every public read returns the currency code with the amount.
- Seed: the launch categories (bubble guns, chains, rings, earrings, bracelets) and a few sample articles.

## Out of scope

Uploads (FER-011) and all UI.

## Acceptance criteria

- Public procedures never return drafts or another store's rows, with tests on both sides of each rule.
- Search matches title and description in the requested locale.
- The paginated list is stable while rows are inserted, per the template's keyset rule.

## Notes

"Article" is the word in the interface (artículo). The code and tables use `product`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
