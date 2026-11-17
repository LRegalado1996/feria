# FER-042 Catalog content for crawlers that run no script

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-039

## Goal

A search engine that reads only the HTML (Bing, and the link previews of most chat apps) sees the catalog's articles, not its loading placeholder.

## Context

Found while fixing the home for such crawlers in FER-039 (`docs/agents/nextjs.md` § Store pages, "What a crawler that runs no script reads"). For these crawlers Next renders each page per request and holds the response for the metadata, but it does not wait for every Suspense boundary, and React writes a finished boundary in place only while the page is under its first-write size limit (about 12.8 KB). The redesigned header alone is about 12.3 KB, so on `/products` the first page of articles and the footer arrive hidden, revealed only by a script.

Measured on FER-039's build, as Bingbot with scripts off:

- `/` and an article page: whole (the home was fixed in FER-039; the article page is prerendered).
- `/products`, with or without filters: the first page of articles and the footer are hidden; the skeleton shows. This was already so before FER-039.
- `/cart` and `/orders/{token}` are partly hidden too, but both are `noindex`.

## Scope

- Make the catalog's first page and footer part of the HTML for these crawlers, the way the home does it (read before rendering, outside any boundary), or choose another way and record why.
- Weigh what browsers lose: the catalog keeps its static shell today; rendering it per request trades that for complete HTML.
- Extend the e2e crawler check (`src/e2e/tests/store/store.e2e.ts`) to the catalog.

## Acceptance criteria

- As Bingbot with scripts off, `/products` and a filtered `/products?category=…` show their articles and footer.
- The choice and its cost for browsers are written in `docs/agents/nextjs.md` § Store pages.
