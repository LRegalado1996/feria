# FER-017 Article upload wizard

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** in progress
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

## Decisions

Lucas's, on 2026-11-17, before the screens were built:

- **Phone first.** Most articles are loaded from a phone: every screen is drawn at 390 px first, 44 px targets, the step's main action in a bar under the thumb, nothing scrolling sideways, the keyboard covering neither the field nor the action; then the computer.
- **Built directly in the admin's look** (FER-040), no prototype. The review's previews are the storefront's own card and article (FER-039) on the grey tile.
- **A draft saves itself to the database.** The first photo that arrives creates it (`product.create`); from then on every change is saved after a pause in the typing, one save at a time and the latest values only, with a quiet "Guardando… / Guardado" and a retry. Leaving and coming back, on another device too, opens it exactly as it was.
- **A published article is edited apart.** Its changes stay in this browser (`localStorage`, one copy per article, read back through zod, dropped once the article changed on the server since) until "Guardar cambios", which asks first: the customers see a save at once. Coming back, unsaved changes are restored with a notice and a way to discard them. Photos uploaded meanwhile are already in the Blob store; the orphan cleanup spares them two days.
- **Photos:** up to 8, three suggested; a large drop zone, the camera or the library on a phone, several at once; thumbnails at once with progress, cancel, retry and remove; the first photo travels alone so the draft exists early, then two at a time; reorder by dragging, by buttons and by the keyboard, said aloud; the wizard asks which is the main one (the cards' photo), which moves it first. A file that is no image or weighs over 25 MB is refused before any work. **Transparency survives:** a cut-out photo keeps its transparent background (WebP with alpha, PNG where WebP cannot be written, never JPEG).
- **Details:** the store's categories with their groups, the price in either notation (FER-035), filters as chips with a new value added in place, Spanish first and English a tab away (once any English is typed, its title is needed to publish), the search and share texts folded away with a live preview of the result and the card. An empty slot for FER-018's button.
- **Review:** the card and the page as the store shows them; "Publicar" waits until nothing is missing and says what is, each a link to its field; "Guardar como borrador".
- **After publishing:** "Ver en la tienda", "Copiar enlace", "Cargar otro", and a small celebration (CSS only). Steps slide, photos settle; reduced motion stills all of it.
- **The same screens edit an article**, a draft by autosave and a published one by "Guardar cambios", with "Pasar a borrador"; a draft can be discarded (deleted, after asking).
- **The list** at `/admin/products` is simple here: cover, title or "Sin título", category, price, draft or published, availability, a card on a phone and a row on a computer, "Cargar más", "Nuevo artículo". Search, filters, quick edits, bulk, order and delete belong to FER-019.

## Outcome

- **Routes:** `/admin/products` (`organisms/product-list`, `molecules/product-list-row`), `/admin/products/new` and `/admin/products/{id}` (`products/product-wizard-page.tsx`, `organisms/product-wizard`); English under `/en`. The step is `?step=`; the draft's own address replaces `/new` once it exists (`docs/agents/nextjs.md` § Admin pages).
- **Screens:** `molecules/product-wizard-steps`, `product-save-status`, `product-photo-drop`, `product-photo-grid` (dnd-kit), `product-details-form` (with `product-filter-chips` and `product-seo-preview`/`store-share-preview`), `product-publish-gaps`, `product-publish-success`; the review draws `molecules/store-article-preview` from the storefront's `store-article-card` and `store-article-main` (the article page's top block, now shared). Copy in `src/content/{es,en}/articles.ts`.
- **Saving:** `useProductAutosave` over `createSaveQueue` (`src/lib/admin/save-queue.ts`); `src/lib/admin/product-edits.ts` for a published article's local copy; `src/lib/catalog/product-form.ts` for the form's round trip; `resolvePublishGaps` moved to `src/lib/catalog/publish-gaps.ts` so the wizard and the server share it; the article page's search texts to `src/lib/seo/article-metadata.ts`, which the preview reads.
- **Uploads:** `usePhotoQueue` (several at once, refusals before work); `prepareImage` keeps transparency (FER-011's decision updated).
- **Tests:** unit tests for every new and changed file; `src/e2e/tests/admin/article-wizard.e2e.ts`: create from photos and publish (the store shows it), on a computer and at 390 px; a draft left half-way restored after a reload and from the list; photos ordered and the main one chosen by keyboard, said aloud; publishing blocked with what is missing next to each field; a published article's changes kept across a reload and shown by the store only once saved; the price `12,50` and `12.50` read as twelve and a half on `/` and on `/en` (FER-035's pending e2e).
- **Found on the way:** an article's share card draws only a photo stored on this site (`ownUrl()`), so an uploaded photo is left out of it and the card shows its moss block; the wizard's preview shows the same and says so. Left for Lucas to decide (it needs the card to fetch from the Blob store).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
