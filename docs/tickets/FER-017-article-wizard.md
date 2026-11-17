# FER-017 Article upload wizard

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-011, FER-016, FER-033, FER-040

## Goal

Loading an article is the product's showpiece: photos in, a published article out in under a minute, on a phone, and pleasant enough to demo to a prospective client.

## Scope

- Step 1, photos: a large drop zone, camera or gallery on mobile, three photos suggested and more allowed. Thumbnails appear at once with upload progress; drag to reorder; the wizard asks which one is the main photo, the one the storefront's cards show (Lucas uploads it already cut out, its background removed by hand, so it sits on the grey tile; the wizard only accepts the photos, 2026-11-16); remove and retry per photo.
- Step 2, details: title, category, price, description, availability, and the store's filters (FER-033) as tappable chips: colors with their swatch, several allowed, and "add a new value" without leaving the wizard. Spanish first, with English one tab away. SEO title and description sit in a collapsed "search and sharing" section with a live preview of the Google result and the share card.
- Step 3, review: a live preview of the article card on its grey tile and of the article page, as [FER-039](FER-039-storefront-redesign.md) draws them, then "publish" or "save as draft".
- A slot in step 2 for the "fill with AI" button delivered by FER-018.
- The draft is created as soon as the first photo uploads and saved on every change, so nothing is lost if the phone locks or the tab closes.
- The same screens edit an existing article.
- A new article takes the last place in the store's own order, the catalog's default ([FER-044](FER-044-catalog-round.md)): the database's default for `product.position` already gives it the next number, so the wizard sends no position.
- After publishing: a success state with "view in store", "copy link" and "load another".
- Built in the admin shell and cards of [FER-040](FER-040-admin-redesign.md). Steps slide, thumbnails settle, the publish moment has a small celebration. All of it honors reduced motion.

## Acceptance criteria

- A new user publishes an article from a phone in under a minute without help.
- Leaving mid-way and returning restores the draft exactly.
- Field errors appear next to the field in the active language; publishing is blocked until the FER-010 minimum is met, and the wizard says what is missing.
- Fully usable by keyboard and screen reader, including photo reordering.
- E2E covers create, resume a draft, edit and publish, and the price field reads `12,50` and `12.50` as twelve and a half on `/` and on `/en` (carried over from [FER-035](FER-035-number-input-decimal-separators.md), whose e2e needs this first price form).

## Notes

Build with react-hook-form and zod as the template requires; autosave goes through a hook with optimistic updates, modelled on the template's create hook.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
