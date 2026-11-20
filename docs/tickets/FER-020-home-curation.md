# FER-020 Home curation: announcement, banners, rows

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-016, FER-011, FER-040

## Goal

The store decides from `/admin/home` what its home shows, so an update is a few taps: the announcement bar, the photo banners, and the rows of articles between them.

Rewritten on 2026-11-16 to the structure of the reference store ([FER-039](FER-039-storefront-redesign.md)).

## Scope

- Tables `announcement`, `banner`, `ranking_entry`, `featured_product` and their translations, with services and routers.
- **Announcement bar:** one line of text in both languages, an optional link, an active switch, optional start and end dates. First content: "Encontranos en la feria, del 5/12 al 5/1".
- **Banners:** a photo with a phone and a computer crop preview, title and button label in both languages, link (an article, a category or a URL), active switch, optional start and end dates. Each banner goes either in the cover, the carousel at the top of the home that moves through its banners on its own, or between two rows, at a position chosen here.
- **Rows:** the home's rows of articles are the store's categories (those with published articles), in an order chosen here, plus two curated ones: "best sellers" (pick and order up to ten; curated by hand, not computed from orders) and "featured" (two to four).
- A preview of the home with the current choices before saving.
- Built in the admin shell and cards of FER-040, and comfortable on a phone.

## Acceptance criteria

- A banner or an announcement outside its date range disappears from the storefront without anyone touching it.
- An article that becomes unavailable or unpublished drops out of the curated rows on the storefront, and the admin shows a warning beside it.
- E2E: set the announcement, add a banner, build a ranking, see all three on the home.

## Notes

The fair banners ("find us at the fair, December 5 to January 5") are content created here in FER-031, not code.

## Decisions

- **One announcement per store** (unique on `storeId`), saved whole: the bar shows one line, so a schedule of several would only be a list nobody reads. Its days and the banners' are days, not instants (`date` columns, both included, in `America/Montevideo`): "del 5/12 al 5/1" is what the owner thinks in.
- **The bar keeps its two lengths:** each language has its line and an optional shorter one for a phone (40 characters), as the fixed notice of FER-039 had; without the short one, a phone shows the whole line.
- **The home's order is one sequence** (`home_section`): the categories' rows, "best sellers", "featured" and the banners between rows, each a place in it, so a banner sits between the rows the owner put it between and moves with the list. A category or a banner added since the last save shows after the rest until the home is saved again; a store that never saved its home opens on "best sellers", "featured", then its categories. Every category with published articles has a row; there is no switch to hide one (an open question for Lucas).
- **Category rows** show up to 12 published articles each, in the store's own order, sold-out ones included (dimmed, as in the catalog); **curated rows** leave out what is not published or not available. A group (Bijouterie) has a row only for articles of its own: its categories have theirs.
- **A banner's link** is nowhere, an article, a category or an address (a site path or `https`); a link to an article no longer published, or one deleted, leaves the banner without a link instead of leading to a 404, and the admin says so.
- **The cover holds at most six banners** (`COVER_BANNERS_MAX`): the carousel's controls, a pause button and one 44 px dot per banner, must fit a 360 px phone. The service refuses a seventh, created there or moved in, with `CONFLICT`, and the banner's sheet says why.
- **The preview** reads both forms as they are typed and the banners as saved (each banner is saved from its own sheet), on the business day the server answered.

## Outcome

- **Data** (migration `0018`, expand only): `announcement` and `announcement_translation`, `banner` and `banner_translation`, `home_section`, `ranking_entry`, `featured_product`, with their checks (days in order, one link, a whole phone photo, the cover's position exactly for cover banners, a section's target matching its kind, positions within the caps). `docs/project/data-model.md` § Home curation.
- **Services and API** (`src/server/services/home.ts`, `home` router, `src/lib/schemas/home`): `home.get`, `home.saveAnnouncement`, `home.createBanner`, `home.updateBanner`, `home.deleteBanner`, `home.saveLayout`, all `adminProcedure`, every write through `writeToHome` (the login re-checked in the transaction, the home's cache dropped after) under the home's advisory lock, with every id checked to be the store's. Banner photos are uploads of the new purpose `banner` (5 MB), checked with `isOwnBlobUrl`, kept when left out, discarded after the commit when replaced, removed or deleted; their columns joined `IMAGE_URL_COLUMNS`. Links are validated by `isSafeHomeLink`.
- **The public read for FER-022:** `getHomeContent(db, { currencyCode, locale, storeId, today }): Promise<HomeContent<ProductCard>>`, cached as `readHomeContent(store, locale)` in `src/server/cache/home.ts` under the tags `home:<storeId>` and `catalog:<storeId>`, refreshed at the next midnight in Montevideo. `HomeContent` (`src/lib/home/content.ts`): the announcement, the cover's banners and the sequence of rows and banners, already filtered; `homeHref` localizes a link. The pure rules are shared with the admin's preview: `resolveHomeSections`, `composeHomeSections`, `scheduleStatus`.
- **Storefront:** the shell's bar reads the store's announcement (`readAnnouncement`), with its link and its phone line; with none on, no bar. `molecules/store-banner` takes no link too. The fixed notice left the dictionaries; `storefront.home.bestSellers` and `featured` name the curated rows.
- **Admin:** `/admin/home` (`organisms/home-curation`) replaces "Próximamente": the announcement, the banners with a side sheet (photos with the computer and phone crops, texts, link, switch, days, place), the order of the cover, the rows and the curated articles (warnings beside what cannot be bought), and the preview built from the storefront's pieces.
- **Seed:** the announcement ("Encontranos en la feria, del 5/12 al 5/1"), three cover banners and two between rows from `public/seed/` (three new phone crops, credited in `docs/brand/seed-photos.md`), the home's order, eight best sellers and four featured articles; each part only on a store that has none (FER-031's demo content).
- **Tests:** unit tests for every new file; `src/server/services/home.integration.test.ts` (days on both sides of each boundary, availability, ownership, the two-writer lock test); `src/e2e/tests/admin/home-curation.serial.e2e.ts` (set the announcement and see it on the storefront's bar, add a banner, build a ranking); the e2e run writes a fixed announcement for every worker (`STORE_ANNOUNCEMENT`). The storefront-home half of the e2e lands with FER-022.
- **Docs:** `docs/project/data-model.md`, `docs/agents/nextjs.md`, `docs/agents/security.md`, `design.md`, `docs/brand/seed-photos.md`, `src/e2e/AGENTS.md`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
