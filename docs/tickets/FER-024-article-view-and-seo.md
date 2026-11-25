# FER-024 Article view and SEO

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-021, FER-010

## Goal

An article page convinces, loads instantly from a shared link, and is fully readable by search engines and AI assistants.

## Scope

- `/{store}/products/{slug}`: swipeable gallery with zoom, title in display type, price, description, quantity and "add to cart", "ask by WhatsApp" with the article pre-written, share button, related articles.
- An unavailable article stays visible, cannot be added, and offers "ask by WhatsApp".
- Metadata per article and locale from the SEO fields, with fallbacks to title and description; canonical and `hreflang` alternates.
- A generated share image per article: photo, title and price in the store's theme.
- Structured data: `Product` with `Offer` (price, currency, availability), `BreadcrumbList`, and `Organization` for the store.
- `sitemap.xml` and `robots.txt` covering every active store, both locales; `llms.txt` per store, following the approach in `this-is-pepe`.
- Drafts and deactivated stores are never indexed or listed.

## Acceptance criteria

- Structured data validates in Google's Rich Results test for a seeded article.
- A link pasted into WhatsApp shows the article photo, title and price.
- Lighthouse on mobile: performance, accessibility and SEO at 95 or above.
- E2E: gallery, add to cart, unavailable state, metadata in both languages.

## Notes

Read the `seo-ai-visibility` skill in `this-is-pepe` before starting.

Since [FER-043](FER-043-category-groups-and-pages.md) an article's page is `/productos/{slug}` (English `/en/productos/{slug}`), under the page of all articles; the addresses below are the ones this ticket was written with.

## Outcome

- `/{store}/products/{slug}` (`organisms/store-article`): a breadcrumb, the photos (`molecules/store-gallery`: swipe with snap, previous and next, thumbnails, a full-screen zoom where the phone's pinch works), the name in the display face, the price, the quantity and "Agregar al carrito" (`molecules/store-article-purchase`, saying what adding did), "Consultar por WhatsApp" with the article and its link pre-written when the store has WhatsApp, the share button, the description and related articles with their own "Agregar".
- A sold-out article stays visible with "Agotado por ahora", has no add button and still offers WhatsApp.
- Static output with a real 404 for a draft, a deleted article or an inactive store: the reads are cached per store's catalog and every visible write drops them (`writeToCatalog`, `docs/agents/nextjs.md` § Store pages).
- Metadata per article and language: the SEO title and description, else the title and the start of the description (cut at a word at 160 characters), else the store's tagline; the canonical address and one per language.
- A share card per article (`[slug]/opengraph-image.tsx`): its first photo, name and price in the store's colors, named after the article.
- Structured data (`atoms/json-ld`, `src/lib/seo/structured-data.ts`): `Product` with its `Offer` (price in major units, currency, in or out of stock), `BreadcrumbList` and the store as `Organization`, all from what the page shows; every `<` escaped.
- `/sitemap.xml` (`src/app/sitemap.ts`): every active store's home, catalog and published articles, each in Spanish and English with both as alternates; empty while the storefront is closed. `/robots.txt` (`src/app/robots.ts`): everyone allowed, AI crawlers named, the admin, the API and the coming-soon page disallowed, the sitemap linked. Both were redirected by the page proxy before; its matcher now skips them.
- `/{store}/llms.txt` and `/en/{store}/llms.txt` (`src/lib/seo/llms.ts`), per llmstxt.org: the store's name, tagline and description, its categories and its published articles with their prices; an inactive or unknown store is a 404.
- Drafts and inactive stores are never listed: `src/server/services/seo.ts`, with integration tests that prove a draft, an article of an inactive store and an inactive store are absent.
- E2E (`src/e2e/tests/store/article.e2e.ts`): the gallery and its zoom, adding a quantity, the sold-out state with WhatsApp, the title, canonical address and structured data in both languages, a draft's 404.
- **Closed on 2026-11-25** (Lucas), the three criteria that needed a public address checked on production (`market.lucasregalado.com`):
  - **Structured data:** Google's Rich Results test on `/productos/cadena-estrella-tornasol` finds three valid items: product snippet, merchant listing and breadcrumb. Its only notes are two optional fields of the offer, `shippingDetails` and `hasMerchantReturnPolicy`, which need a shipping and returns policy the store has not set ([FER-084](FER-084-shipping-and-returns-in-structured-data.md)).
  - **WhatsApp:** Lucas pasted the same link on 2026-11-25. The preview shows the title, the description and the share card with the name and the price; the card's photo is the plain block, because the card draws only a photo on this site and every uploaded photo is in the Blob store ([FER-049](FER-049-share-card-blob-photos.md)). A first paste showed only the domain and a second, two minutes later, the full preview: a cold start, not the page.
  - **Lighthouse on mobile:** accessibility, best practices and SEO 100; performance 85 on production (Lighthouse 13.6.0, its mobile profile, the median of three runs), short of the 95 the criterion asks. Lucas accepted closing at what the changes below reach and moved 95 to [FER-085](FER-085-store-pages-at-95.md). Locally, on a production build with a Sentry DSN (so the client SDK is in the bundle, as on production) behind an HTTP/2 front, the article page went from a median of 80 to 91, its largest paint from 3.6 s to 3.0 s and the script it loads from 305 KB to 216 KB, by two changes: Sentry's replay recorder (about 150 KB compressed, the heaviest script on the page) loads as its own chunk five seconds after the page is idle (`src/lib/sentry-replay.ts`), and the gallery's photos past the second join once the page is idle (`usePageIdle`), instead of being fetched with the first. Loading the cart panel on demand was measured too and left out: the query client and the oRPC client it uses are in every page through the root providers, so it would save about 10 KB. With Sentry inert the same page scores 91 to 92: what is left is the work of hydrating the page on a slow phone. **Still owed:** the same measurement on production once these changes are deployed.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
