# FER-060 Pages built from sections, from the admin

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-058, FER-059, FER-043

## Goal

The store creates pages of its own from the admin. Each page has its own address, is built from the same blocks as the home, and any page can be chosen as the home.

Asked by Lucas on 2026-11-19: "implement the page that creates pages too, so it is rounded off and I can use my imagination later".

## Decisions

Taken with Lucas on 2026-11-19 and 2026-11-20.

- **A page** has a name (Spanish required, English optional), an address, a title and description for search engines in each language (made from the name when left empty), draft or published, and "Mostrar en el encabezado" (off by default). Its blocks are every kind the home has: a cover of banners, banners and article spotlights between rows, a category's row, the best sellers and the featured articles.
- **Addresses: one top-level space.** A page is at `/<slug>`, with the same slug under `/en`. Pages, groups and categories share that space, and the site's own paths (`RESERVED_CATEGORY_SLUGS`) are never a page's. Both directions are enforced: a page refuses a category's or another page's address, and a new category skips a page's. The serving reuses the catalog's one-segment route: the route looks for a page first, then for the catalog.
- **A draft or unknown address is a 404** for the public (the catalog's not-found page). A signed-in admin sees a draft with a note, `noindex`.
- **The home is any page, and there is always exactly one** (Lucas, 2026-11-19). The database guarantees it: `store.homePageId` is required and references one of the store's own pages, which therefore cannot be deleted (FER-058). The service adds three rules. Only a published page can become the home. The home cannot be unpublished or deleted; the admin says why ("Esta página es la home: elegí otra antes de borrarla."). Changing the home is one write under the pages' lock with the store's row held, so two admins choosing at once leave exactly one, the last one. Every page is an ordinary page with a name, address, texts and status, the home included.
- **The home's own address leads to `/`**: `/home` redirects to `/` and `/en/home` to `/en`, and the canonical and `hreflang` are `/`. The sitemap and `llms.txt` list the home once, as `/`. "Mostrar en el encabezado" is not offered for the home, since the logo leads there. `/` takes the home page's own title and description for search engines when they are written, else the store's. Its `h1` stays the store's name.
- **Only the home fills in every category's row** (FER-020's rule). Another page shows only the blocks it was given ("Agregar bloque"), and its editor can take a row out.
- **Naming:** the home is called "Home" in every language: the chip in the list, its name after `0025`, "Usar como home", "Esta página es la home…". The admin's entry is "Páginas" ("Pages"), in the slot the home's screen had, so the phone's menu keeps eight entries. `/admin/home` leads to the editor of the page that is the home now. The storefront's existing "Inicio" (the breadcrumb's first step) is unchanged.
- **The header** lists the published pages the admin shows there **before the categories**, right after "Catálogo" (decided 2026-11-20 after a QA pass found a page whose name did not fit the computer's line and so never showed). The computer's line holds only what fits and has no menu. A category left off it can still be reached through the catalog's filter; a page left off would be unreachable. The phone's menu lists every entry.
- **The best sellers and the featured articles are the store's lists**, shared by every page that shows them. Their cards in any page's editor say so: "Esta lista es la misma en todas las páginas."
- **The example page** (seed): "Regalos de Navidad" / "Christmas gifts" at `/regalos`, published, off the header. It has a cover banner, the "Cadena corazones" spotlight and the Anillos and Aros rows.

## Outcome

- **Data** (migrations `0024` to `0026`, expand then contract): `page` gains `slug` (nullable in `0024`, unique per store, with a format check), `isPublished` and `showInHeader`; `page_translation` (`name`, `seoTitle`, `seoDescription`). `0025` (hand-written, fill only, idempotent) gives the home page `0021` made the address `home` (`home-<id>` when the store already has a category or page there), publishes it and names it "Home" in both languages; `0026` makes `slug` required. Nothing the previous build runs inserts a page, so the window between `0024` and `0026` is safe. `docs/project/data-model.md` § Pages and sections.
- **Services and API:** `src/server/services/page-settings.ts` (`listPages`, `createPage`, `updatePage`, `deletePage`, `setHomePage`, `findStorePage`, `findHomePage`, `listHeaderPages`, `listIndexablePages`); `createCategory` skips a page's address. Procedures `page.list`, `page.create`, `page.update`, `page.delete`, `page.setHome` (`adminProcedure`; `writeToPageSettings`, `writeToHomeChoice`). Cached reads `readStorePage`, `readHomePage` and `readHeaderPages`, under `page-settings:<storeId>` and `home-page:<storeId>`.
- **Storefront:** `(store)/store-page-view.tsx` (resolve, metadata, view), `organisms/store-page`, the `[group]` route (a page first, then the catalog), `(store)/section-lists.ts` (shared with the home), the header's pages (`(store)/store-shell.ts`), the sitemap and `llms.txt` (a "Páginas" section).
- **Admin:** `/admin/pages` (`organisms/page-manager`), `/admin/pages/<id>` (`organisms/page-editor`, renamed from `home-curation`, with the settings card), `/admin/home` (a redirect), `molecules/page-form`, "Agregar bloque" in `molecules/page-layout-editor`; hooks `usePages`, `useCreatePage`, `useUpdatePage`, `useDeletePage`, `useSetHomePage`.
- **Seed:** `src/server/db/seed-pages.ts`, only when the store has no page at `/regalos`.
- **Tests:** unit tests for every new or changed file. Integration tests: `page-settings.integration.test.ts` (address collisions both ways, reserved paths, the database's own unique and the home's foreign key, the home's rules on both sides, a draft refused as home, two admins choosing the home at once, a page and a category taking one address at once, what the storefront reads), the router's anonymous refusal, the seed's example page, and `name-the-home-page-migration.integration.test.ts` (0025 replayed, `home-<id>`, a named page left alone). E2E: `tests/admin/pages.serial.e2e.ts` (create in the sheet, draft 404 and admin preview, add a block, publish, both languages, the header's line and the phone's menu, no-script HTML, unpublish, choose the home, the old home back at its address, the chosen page's address leading to `/`, the home not deletable).
- **Docs:** `docs/project/data-model.md`, `docs/agents/nextjs.md`, `docs/agents/security.md`, `design.md`, `src/e2e/AGENTS.md`.

## Left out

- A banner or a spotlight leaves a page only from its own form or by being deleted; the order has no remove button for them.
- The database does not refuse a page at a reserved path by itself; the service does. A CHECK like the one [FER-048](FER-048-reserved-category-slug-check.md) adds for categories would be the contract step for pages.
- A page's place among the header's pages is the order they were made in.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
