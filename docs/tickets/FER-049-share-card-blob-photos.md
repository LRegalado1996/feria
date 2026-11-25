# FER-049 An article's share card draws its uploaded photo

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
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

## Outcome

- `sharePhotoSource` (`src/lib/seo/share-photo.ts`) decides what the card (`(store)/productos/[slug]/opengraph-image.tsx`) draws for the article's first photo: a photo on this site by its own address, as before; a photo of this deployment's Blob store (`readBlobStore()`, `isOwnBlobUrl` with the `product` purpose: its host, its folder, a name the upload gave) fetched by the card with `redirect: "error"` and a three-second limit, checked to be a JPEG, PNG or WebP of at most 8 MB, and handed to the renderer as a data address (WebP included: the renderer reads it); anything else the plain block. A photo that fails, is slow or is not a photo is the block too, reported (`ShareCard.fetch_photo`) once per photo per server instance.
- The wizard's "Búsqueda y compartir" preview (`molecules/product-seo-preview`) draws the main photo wherever it is stored and no longer says the card leaves it out.
- Unit tests: the host rule on both sides (this store, another Blob store, another host, another deployment's folder, another purpose's folder, no Blob store), each failure reported once over two requests, the size limit at and past it, the timeout; the card's renderer input for a Blob photo is its data address.
- **Owed after it reaches production:** paste an article's link into WhatsApp on a phone and see its photo on the card (Lucas did it for FER-024 on 2026-11-25: title, description and price showed, the photo was the block). WhatsApp keeps a link's first preview for a while, so check with an article not shared before.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
