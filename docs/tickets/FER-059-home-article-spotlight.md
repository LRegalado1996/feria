# FER-059 An article in the spotlight on the home

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-020, FER-022, FER-058

## Goal

The home features one article so that "you start scrolling, you see it and it catches your eye" (Lucas, 2026-11-19): a dark block between the rows with the article's photo, its name, its price and a button that puts it in the cart.

## Decisions

Taken with Lucas on 2026-11-19, from the mock he chose ("Opción 2 · Bloque oscuro").

- **Look:** a block the width of the window on the moss (`store-contrast`). On a computer two columns: the words on the left (an optional lime pill label such as "Nuevo", the article's name huge in the display face in lime, the price in white, an optional short phrase in the moss's soft tone, a lime pill button with ink words), the article's photo on the right on the grey tile; on a phone the photo first, the words under it. The storefront's tokens, not the mock's raw CSS; contrast 4.5:1 or better; 44 px targets. After landonorris.store's structure and feel only.
- **The button adds the article to the cart**, with the article page's own words and behaviour ("Agregar al carrito"; the cart's side panel opens on its line, FER-045). The logic is the article page's, shared (`useAddToCart`), not a copy. It is the owner's explicit exception to [FER-039](FER-039-storefront-redesign.md)'s cards without a button: this is a block, not a card.
- **Clicks elsewhere go to the article** (an assumption: his sentence was cut off at "si clickea en la foto, en el título o cualquier otro texto del bloque…"; read as "…goes to the article's page"). Built accessibly: the name is the block's one link, its hit area stretched over the block, so the photo, the label and the phrase lead there too; the button is a real button beside it, never inside the link; one tab stop for each.
- **One or several, placed from the admin** between the rows like a banner: a new block kind of FER-058's model (`spotlight`). By default, and in the seed, one sits right after the cover, before the first row.
- **Content:** the photo (the article's first), the name and the price are the article's; the label and the phrase are optional, in Spanish and English, each falling back on its own to the other language. A spotlight whose article is not published or cannot be bought does not show on the storefront, and the admin flags it as it does a curated article.
- **Motion:** it rises into view like the home's other sections, nothing more; nothing under reduced motion. The cover still moves every six seconds.
- **Naming in the admin:** "Vidrieras" ("Spotlights"), not "Destacados", which is already the curated row's name; "Vidriera" is the stall's shop window.

## Outcome

- **Data** (migration `0023`, expand only): `spotlight` (`storeId`, `productId`, cascading with the article) and `spotlight_translation` (`label` up to 24, `phrase` up to 140, at least one per row); `page_section` gains `spotlightId` (cascading, indexed, unique per page) with its target CHECK, and its kind CHECK takes `spotlight`. `docs/project/data-model.md` § Pages and sections.
- **Deploy window** (as FER-058's): the previous build reads a page's sections and drops a kind it does not know, and every write of the sections it makes (a saved order, a banner placed between rows) rewrites them whole. So while this deploy runs, and for as long as a tab stays pinned to the previous build (`docs/agents/skew-protection.md`), such a write takes the spotlights off the page: their rows stay, listed in the admin as "No está en esta página", and have to be placed again. With one admin this is a window of seconds, accepted; setting the new deployment's Skew Protection Threshold right after the deploy closes it.
- **Services and API:** `createSpotlight`, `updateSpotlight`, `deleteSpotlight` in `src/server/services/page.ts` under the pages' lock, every id held to the store's (the article and the store's spotlights `FOR KEY SHARE`); `page.createSpotlight`, `page.updateSpotlight`, `page.deleteSpotlight` (`adminProcedure`, `writeToPages`); `savePageLayout` refuses a spotlight not on the page. `getPageContent` fills `PageSpotlight` sections only for an article published and available; `getPageCuration` lists the store's spotlights with their words and whether each is on the page.
- **Storefront:** `molecules/store-spotlight` (server) and `molecules/store-spotlight-button` (client), drawn by `molecules/store-page-sections` (so the admin's preview shows it too) and on `/design`; the display size `store-display-spotlight`; the home's JSON-LD lists it as a list of one. `useAddToCart` (`src/lib/hooks/cart/use-add-to-cart.ts`) is the add both buttons share.
- **Admin:** the "Vidrieras" card on `/admin/home` with `molecules/spotlight-form` in the side sheet (article, label and phrase in both languages, place), delete behind a question; the order lists "Vidriera: <article>" with the warning beside one the storefront leaves out. Hooks `useCreateSpotlight`, `useUpdateSpotlight`, `useDeleteSpotlight`.
- **Seed:** "Burbujero pez" right under the cover, "Nuevo"/"New" and a phrase in both languages, only when the store has no spotlight; added to the local demo database with `pnpm db:seed`.
- **Tests:** unit tests for every new file and the shared add; the service's integration tests (both sides of availability and publication, the article's deletion, an edit and a delete, refusals) and a two-writer test of two spotlights added at once; the router's anonymous refusal; e2e: `tests/store/home.serial.e2e.ts` (right after the cover in both languages at 1440 and 390 px, the name and the photo lead to the article, the button adds it and opens the panel, gone once the article is unpublished, and a crawler without script finds it) and `tests/admin/home-curation.serial.e2e.ts` (add, place first, preview, home, delete; the sold-out warning).
- **Docs:** `docs/project/data-model.md`, `design.md`, `docs/agents/nextjs.md`, `src/e2e/AGENTS.md`, FER-039's note on cards.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
