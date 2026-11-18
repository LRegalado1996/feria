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

Lucas's, on 2026-11-18, after trying it live (mostly from a phone):

- **Creating is three steps; editing is one screen.** "Para crear está bien en 3 pasos, pero para editar lo mejor es ver todo en la misma pantalla." A new article keeps the journey; an article opened from the list, draft or published, shows photos, details, filters and the previews on one screen. The address decides (`readWizardMode`): `/admin/products/new` and `/admin/products/{id}?step=<step>` are the journey (the draft's address keeps its step from the first photo on, so a reload mid-way lands on the same step), `/admin/products/{id}` is the single screen, and a published article is always the single screen. Publishing ends the journey: the address drops its step and the success stays on screen. A draft on the screen still saves itself and offers "Publicar" and "Descartar borrador"; a published one keeps its local copy, "Guardar cambios" after asking, "Descartar cambios" and "Pasar a borrador".
- **A failed photo stays in its tile.** "Al cargar imágenes dos bugs: se va de la caja y no me dejó agregarla." The tile grew to its widest line (an `auto` grid column under a reason that would not wrap), pushing the photo and its buttons out. Its column is now `minmax(0, 1fr)`, the reason wraps, discard sits on the photo's corner and "Reintentar" under the reason. "No me dejó agregarla" was this machine's missing `BLOB_READ_WRITE_TOKEN`, not a bug: a server without a Blob store now says so once, over the photos' zone, which takes none. A first photo that fails creates no draft; the person can discard it and go on.
- **Fields are white.** "Los inputs deberían tener fondo blanco, si no parece que están deshabilitados." `atoms/input` and the wizard's description and category take the field's own surface (`bg-background`, a step lighter in dark), a disabled field the muted one.
- **No note under the price.** "En UYU. Podés escribir 12,50 o 12.50." is gone; the field shows its currency's sign inside it and says the currency's name to a screen reader. Both notations are still read (FER-035).
- **No search texts of their own.** "No es necesario, tenés que usar los mismos que se ingresan arriba. Pero sí me gusta que dejes cómo se vería el preview para compartir." The "Título/Descripción para buscadores" fields are gone; the Google result and the share card stay, as previews of the title, the description and the main photo ("Búsqueda y compartir"). The wizard sends `seoTitle` and `seoDescription` as `null`, so any save clears texts an earlier version stored, and the article's page reads only the title and the description (`articleSearchTexts`), so a stored one is never shown meanwhile. The `seo_title` and `seo_description` columns and the API's fields stay until a ticket drops them.
- **No published panel.** "Esta parte sacala", of the blue panel over a published article ("Está publicado: los cambios quedan guardados en este navegador…", what was restored, and its buttons). It is gone. "Ver en la tienda" sits on the store card's preview, across from "Tarjeta en la tienda" (only for a published article; a plain link in a new tab), and "Descartar cambios" (while there are some) and "Pasar a borrador" are a "Más acciones" menu (⋯) beside "Guardar cambios", in the top bar on a computer and the bar under the thumb on a phone, each asking first as before. What the panel said about changes kept in this browser is a toast, once, as the screen opens ("Recuperamos cambios…", or that they were dropped because the article changed since); the save line beside the button keeps saying whether changes wait.

## Outcome

- **Routes:** `/admin/products` (`organisms/product-list`, `molecules/product-list-row`), `/admin/products/new` and `/admin/products/{id}` (`products/product-wizard-page.tsx`, `organisms/product-wizard`); English under `/en`. The step is `?step=`; the draft's own address replaces `/new` once it exists (`docs/agents/nextjs.md` § Admin pages).
- **Screens:** `molecules/product-wizard-steps`, `product-save-status`, `product-photo-drop`, `product-photo-grid` (dnd-kit), `product-details-form` (with `product-filter-chips` and `product-seo-preview`/`store-share-preview`), `product-publish-gaps`, `product-publish-success`; the review draws `molecules/store-article-preview` from the storefront's `store-article-card` and `store-article-main` (the article page's top block, now shared). Copy in `src/content/{es,en}/articles.ts`.
- **Saving:** `useProductAutosave` over `createSaveQueue` (`src/lib/admin/save-queue.ts`); `src/lib/admin/product-edits.ts` for a published article's local copy; `src/lib/catalog/product-form.ts` for the form's round trip; `resolvePublishGaps` moved to `src/lib/catalog/publish-gaps.ts` so the wizard and the server share it; the article page's search texts to `src/lib/seo/article-metadata.ts`, which the preview reads.
- **Uploads:** `usePhotoQueue` (several at once, refusals before work); `prepareImage` keeps transparency (FER-011's decision updated).
- **Tests:** unit tests for every new and changed file; `src/e2e/tests/admin/article-wizard.e2e.ts`: create from photos and publish (the store shows it), on a computer and at 390 px; a draft left half-way restored after a reload and from the list; photos ordered and the main one chosen by keyboard, said aloud; publishing blocked with what is missing next to each field; a published article's changes kept across a reload and shown by the store only once saved; the price `12,50` and `12.50` read as twelve and a half on `/` and on `/en` (FER-035's pending e2e).
- **After Lucas's review (2026-11-18):** `src/lib/admin/product-wizard-mode.ts` (`readWizardMode`, `wizardStepPath`); the single screen in `organisms/product-wizard` (`ArticleScreen`, `WizardCard`; the same photos, details, filters and previews as the journey's steps); `molecules/product-details-form` holds the texts, category, price and availability only, the filters and previews being the wizard's sections; `molecules/product-seo-preview` computes the result and the card from the title, description and main photo; `molecules/product-photo-drop` takes `unavailable` (the page reads `readBlobStore()`); `molecules/product-photo-grid`'s `QueuedTile`; `formatCurrencySign` in `src/lib/utils/format.ts`. The e2e covers the journey (a reload mid-way staying on its step), a draft and a published article on the single screen, no search inputs, and a failed photo's boxes inside its tile at 390 px.
- **Found on the way:** an article's share card draws only a photo stored on this site (`ownUrl()`), so an uploaded photo is left out of it and the card shows its moss block; the wizard's preview shows the same and says so. Left for Lucas to decide (it needs the card to fetch from the Blob store).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
