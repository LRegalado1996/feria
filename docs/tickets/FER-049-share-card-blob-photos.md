# FER-049 An article's share card draws its uploaded photo

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-017, FER-024

## Goal

A link to an article pasted into WhatsApp or Instagram shows the article's own photo. Today the share card (`(store)/productos/[slug]/opengraph-image.tsx`) draws only a photo stored on this site (`ownUrl()`, `src/lib/seo/origin.ts`), because its renderer fetches the image itself. Every photo the wizard uploads ([FER-017](FER-017-article-wizard.md)) lives in the Blob store, on another host, so every shared article shows the card's plain moss block instead. The wizard's "Búsqueda y compartir" preview (`molecules/store-share-preview`) draws the same block and says so.

## Scope

- The card fetches a photo from this deployment's own Blob store: the host derived from `BLOB_READ_WRITE_TOKEN` (`readBlobStore`, `isOwnBlobUrl`), never any other host, so an address in the database cannot make the renderer fetch an arbitrary URL.
- A fetch that fails or is slow falls back to the block, within the renderer's time budget; it is reported once, not per crawler hit.
- The wizard's share preview drops its note and shows the photo the card will draw.
- Unit tests for the host rule on both sides (own store, another store, another host); an e2e that the card's response is an image built with the photo (or a unit test on the renderer's input when the e2e cannot see it).

## Acceptance criteria

- A published article with an uploaded photo shares with that photo on WhatsApp (checked by hand on a real phone).
- A photo URL on any host other than this deployment's Blob store is never fetched.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
