# FER-024 Article view and SEO

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
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
