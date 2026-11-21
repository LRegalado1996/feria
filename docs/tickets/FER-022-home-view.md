# FER-022 Home view

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-039, FER-020

## Goal

The home makes someone who scanned a QR at the stall want to keep scrolling, and gets them to an article in one tap.

Rewritten on 2026-11-16 to the structure of the reference store, with the components of [FER-039](FER-039-storefront-redesign.md).

## Scope

At `/`, top to bottom:

1. The announcement bar (in the shell) with the active announcement.
2. The cover: the cover carousel from FER-039 with the cover's banners, moving on its own; each is a full-width photo with its title and "Comprar ahora →" on the bottom-left corner. A single banner shows still.
3. A row of articles: heading, "Ver todo", cards that scroll sideways.
4. A banner placed between rows, full width.
5. The next row, and so on: rows and banners alternate in the order set in FER-020 (categories, best sellers, featured).
6. The footer's social block: Instagram, TikTok and a WhatsApp call to action.

Each section hides itself when it has no content, so a new store never shows an empty block; with no banner at all the home opens on its first row.

## Acceptance criteria

- Server-rendered, cached, and invalidated when curation or articles change.
- The cover's first photo is the page's priority image; its other photos and everything below load lazily with reserved space.
- One `h1`, ordered headings, real text in the HTML for every section.
- Smooth on a mid-range Android phone; rows work by touch, mouse, and keyboard.
- E2E in both languages with seeded content, and with an empty store.

## Decisions

- **The page's `h1` is the store's name, visually hidden** (`sr-only`). The cover is attached to the header, whose logo already shows the name, so a visible name above it would push the cover off the header; a cover's title is a promotion that rotates every six seconds, is a link's text and changes with the season, which the page's one heading should not. The name matches the `<title>`, and a screen reader and a crawler read it first, then each banner and row as an `h2`, in order. A store with nothing to show keeps today's intro, its name a visible `h1`.
- **A store with nothing to show introduces itself** (`organisms/store-intro`: its tagline, its name, its description and "Ver el catálogo"), never a blank page. "Nothing" is no cover banner and no section: no category with a published article, no curated article that can be bought, no banner between rows. With rows but no banner the home opens on its first row; with a banner first and no cover, that banner is the page's priority image.
- **"Más vendidos" and "Destacados" have no "Ver todo".** They already show every article they hold (ten and four at most); "Ver todo" leading to the whole catalog under their name would promise what it is not. A category's row keeps it, to the category's page.
- **The cover is as tall as a catalog page's cover** (`STORE_COVER_HEIGHT`: the window less 17.5rem on a phone, 20rem from `md` up, never under 20rem), which leaves the first row's heading and the top of its cards in the first view at 390×844 and 1440×900, as FER-044 set for the catalog. The admin's crop preview still shows the row banner's proportions (1440×520, 390×472); the cover crops a little taller.
- **The cover's controls move to the bottom right from `md` up**, across from the title; on a phone they stay top right, since the title may take the whole width there.
- **Sections rise into view** (`atoms/store-reveal`, transform and opacity, none under reduced motion); what was on screen at load is never hidden.
- **Structured data:** `WebSite`, the store's `Organization` (as an article's page has it) and one `ItemList` per row, named as on the page. No `SearchAction`: Google dropped the sitelinks search box.
- **The tagline is no longer on a full home's screen**: it describes the home's share card and every page's (`og:description`) and the intro of an empty store. The e2e that checked it on the intro now read the share card.
- **With the coming-soon page published (FER-034)** the public never reaches the home, nor its structured data (the proxy sends `/` to `/coming-soon`, and the sitemap is empty); a signed-in admin sees it under FER-034's preview notice, which sits above the bar, so the cover stays attached to the header. On a phone the notice took three lines (about 120 px) and pushed the first row out of the first view: below `sm` it now shows a short line ("Cerrada al público.", "Store closed.") on one row with its link, the whole notice kept for every reader, as the announcement bar does.

## Outcome

- **Home** (`src/app/[locale]/(store)/page.tsx`): reads the store and `readHomeContent` per request, from the cache, before anything is sent, beside the frame's `shellOf`; renders `organisms/store-home` and the JSON-LD (`webSite`, `storeOrganization`, `itemList` in `src/lib/seo/structured-data.ts`, which now also holds `STORE_LOGO_PATH`). Invalidated by the tags FER-020 set (`home:<storeId>`, `catalog:<storeId>`).
- **`organisms/store-home`**: the sr-only `h1`, the cover (`molecules/store-cover-carousel`, `h2` titles, the first photo the priority image) and `molecules/store-home-sections`; or `organisms/store-intro` for a store with nothing to show.
- **`molecules/store-home-sections`** (new): the sequence of rows and banners, the catalog's cards, "Ver todo" on category rows, each name marked with its language; shared with the admin's preview (`molecules/store-home-preview`, which now draws the home's own sections).
- **`atoms/store-picture`** (new): art direction (`<picture>`, the phone crop below `md`) for the catalog cover and the banners; `molecules/store-banner` takes the banner's photos (`image`, `phoneImage`), a `cover` or `row` size, a heading level and the language of its words; `molecules/store-cover-carousel` takes the home's banners (no link, own words, phone crop); `molecules/store-article-row` marks its heading's language (`titleLang`).
- **E2E**: `tests/store/home.serial.e2e.ts` (both languages with the test's own home placed first: the cover, its priority photo and its phone crop, the rows and the banner between them in order and their links, the pause button and the dots, a row by keyboard, Bingbot with scripts off finding every section, an empty store's intro in both languages, and FER-020's storefront half: the announcement, a banner and a ranking set in the admin all on the home). `db.seed.createBanner` and `homeEdit.saveLayout`/`hideEverything` back them. `store.e2e.ts`, `store-settings.serial.e2e.ts` and `admin/settings.serial.e2e.ts` no longer read the intro.
- **Docs**: `design.md` § Storefront, `docs/agents/nextjs.md` § Store pages, `src/e2e/AGENTS.md`, the tickets' README, [FER-031](FER-031-launch-content.md) (the seed fills the home in local and QA; production's content is Lucas's to load).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
