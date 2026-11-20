# FER-010 Catalog domain: categories, articles, translations

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** done
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

## Outcome

- Schema in `src/server/db/schema/catalog.ts`, migration `0003`; `seed` joins the reserved store slugs (migration `0004`) because the sample photos live in `public/seed/`.
- Public reads, `catalog.categories`, `catalog.products` (keyset on `publishedAt`, `id`; category and search), `catalog.product` and `catalog.related`, resolve the active store from `storeSlug` and answer only its published articles, with the store's currency beside every price. Search matches the title and description the visitor is shown (their language, or Spanish where the article has no text in it), blind to case and accents through Postgres's `unaccent` (migration `0005`): `nandu` finds "Ñandú". It scans the store's texts; a trigram index can follow when a catalog grows past a few hundred articles.
- Store-scoped writes in the `product` router (`create`, `update`, `publish`, `unpublish`, `setAvailability`, `delete`, `reorderImages`) run through `storeProcedure` and `withStoreAccess`. Publishing re-derives `resolvePublishGaps` (image, category, price, Spanish title) under the row's lock and names what is missing.
- Seed: the five launch categories and eleven sample articles in Lucas's store, one unavailable, with photos credited in `docs/brand/seed-photos.md`.
- Adding images is FER-011's (uploads); `reorderImages` orders the ones the seed or the uploader created. (FER-017 replaced it: `product.update` saves the whole article, its photos in order included.) Category management is FER-016's.

## Notes

"Article" is the word in the interface (artículo). The code and tables use `product`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
