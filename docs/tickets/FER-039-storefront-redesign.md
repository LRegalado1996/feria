# FER-039 Storefront redesign

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-038, FER-040 (stacked after it)

## Goal

The store looks and moves like https://landonorris.store: a lime announcement bar, a dark header with the logo in the middle, a white page, articles on grey tiles, wide heavy headings. We take the structure and the feel, never that site's logo, photos or licensed typeface.

Decided by Lucas on 2026-11-16. It replaces the storefront half of FER-005 (black canvas, condensed display type).

## Scope

- **Palette, in the theme file from FER-038:** page white; article tile the light grey `#f3f3f2` (chosen by Lucas on 2026-11-16 from the prototype, over `#ebebeb` and `#e1e1df`); the dark of the header, footer and search panel is the moss of this-is-pepe (`#262a1d`), with its ink (`#15160f`) for text; the accent stays LR Market's lime. Lime on dark for navigation and footer headings; dark on lime for the bar and the primary button. Every pair meets AA, held by the theme's test.
- **Type:** Anybody (Google Fonts, variable) at width 135% and weight 800 through `next/font`, for headings, article names, navigation and buttons, uppercase; chosen by Lucas on 2026-11-16 from the prototype, over Archivo, Mona Sans and Unbounded, and over weight 900; Geist for prices and body copy. The condensed display face leaves the storefront.
- **Announcement bar:** one lime line above the header. Until FER-020 gives it its own text it shows the store's tagline; with nothing to say it is not rendered.
- **Header:** dark and sticky. Links on the left ("Catálogo" and the store's categories, to be revisited), the logo centered, then the language link, a search icon and the cart icon with its count. The search icon opens a dark panel under the header with one large underlined field ("Buscá lo que quieras") and an arrow; it is still a plain form that works before the script loads. On a phone: menu button on the left, logo centered, search and cart on the right.
- **Logo:** the full logo (the tag with LR and MARKET under it) everywhere the brand shows: header, footer, admin, sign-in, share card, coming-soon. The mark alone (LR) is only the browser tab icon and the home-screen icon. `docs/brand/brand.md` changes its size rule to match.
- **Article card:** a grey tile with the photo, an optional white label on its top-left corner ("Nuevo"), the name in the wide face under it and the price in regular type. Unavailable: the name dims and the price line says "Agotado". A reduced price shows the old one struck through.
- **Article row:** a heading, "Ver todo" underlined on the right, cards that scroll sideways with a round lime arrow button. Used on the home and for related articles. Built on shadcn's Carousel (Embla, `embla-carousel-react`), added here with `pnpm dlx shadcn@latest add carousel`, then moved into its tier and made compliant as `AGENTS.md` describes; so is the article page's photo gallery. It replaces `molecules/store-slider`, which is deleted, so the store has one carousel. Touch, mouse drag, trackpad and keyboard; rows neither loop nor move on their own. New packages approved by Lucas on 2026-11-16, who chose Embla over the repo's own slider so the cover can move.
- **Photo banner:** a full-width photo with a title and "Comprar ahora →" on its bottom-left corner.
- **Cover carousel:** several photo banners in the same carousel, moving on their own every few seconds (`embla-carousel-autoplay`), with dots and a pause button (WCAG 2.2.2). It pauses while hovered, focused or touched, and stays still under reduced motion. A single banner shows still, without controls. The banner and the cover land here, shown on `/design`; the home places them (FER-022).
- **Catalog:** a centered title and one line of description, a "Filtrar" pill that opens a panel with categories and filters, "Ordenar por" on the right, a grid of four columns (two on a phone). Everything stays in the address, shareable as before.
- **Article page:** on a computer the name, price, description, quantity and "Agregar al carrito" sit in a column on the left while large photos on grey scroll sideways on the right; on a phone the photos come first. Related articles in a row below.
- **Cart, checkout, order page, 404 and error pages** take the same palette, type and buttons.
- **Footer:** dark, with lime headings: the store and its links, help (how to order, WhatsApp), social icons, and the "made by Lucas Regalado" credit.
- **Buttons** are pills; tiles and photos keep square corners.
- **Coming-soon page** (FER-034) takes the new palette, type and logo.
- **Docs:** rewrite `design.md` § Storefront and `docs/brand/brand.md` (colors, type, logo sizes); update `/design`.

## Out of scope

The home's sections and their content (FER-020, FER-022). Cutting the background out of article photos: Lucas does it by hand before uploading (2026-11-16). The seed photos are shown cropped square on the tile.

## Acceptance criteria

- Home, catalog, article, cart and order page hold from 375 px to a wide desktop without sideways scroll.
- Storefront rules that already hold keep holding: server-rendered shell, 44 px touch targets, visible focus, reduced motion, one `h1`.
- Existing storefront e2e specs pass against the new markup; new ones cover the search panel and the filter panel, by keyboard too.
- The PR carries one image composing every changed screen, phone and desktop.

## Outcome

- **Palette** (`src/styles/theme.ts`): the page white, the article tile `#f3f3f2` (`store-surface`), ink `#15160f`, moss `#262a1d` (`store-contrast`: the header, the footer, the search panel, the phone menu, the order's banner) and the lime. Its test holds eight pairs at 4.5:1; the lime on the moss is now held as small text (11.4:1), since the header's links use it. The logo files, the share card and the home-screen icon follow: the share card and the icon now sit on the moss.
- **Type**: Anybody through `next/font`, variable with its width axis, which the theme sets to 135% on `font-display`; always `font-display font-extrabold uppercase`. Anton is gone, and so are `tracking-display`, `store-display-title` and the `store-eyebrow` utility. New fluid sizes for a page's title, an article's name, a banner's title and the search field.
- **Frame**: every store page renders `organisms/store-frame` (the bar, the sticky moss header, the page) and its footer. The group's layout is only the canvas now: the bar's words (the store's tagline until FER-020) and the header's categories come from the database, which the prerendered layout, an article's static page included, must not read. The catalog and the cart hand the frame promises (`streamedShell`: the header stays in the static shell, an empty bar holds its place, the categories fill in); the home, an article and an order hand it what they read (`shellOf`, the categories through the cached `readCategories`). The home waits for the store before anything is sent, with no static shell: with the new header the first response is about 12 KB before the page, and React then writes any boundary over 500 bytes as its fallback, leaving its content to a script, so a crawler that runs no script (Bingbot) got the home's loading state (`docs/agents/nextjs.md` § Store pages). Adding and reordering a category now drop the cached catalog too (`writeToCatalog`), as every store page lists them. The skip link focuses the content of its own frame, since a page left behind stays in the document.
- **Header**: from 1280 px "Catálogo" and up to five categories while they fit, the full logo in the middle, the language, the search and the cart; below, a menu button that opens a moss panel (full screen on a phone, from the left on a tablet) with home, the catalog, every category and the language. The search icon opens `molecules/store-search-panel`, a modal panel under the header with one field, a plain GET form to `/products?q=`; before the script runs, the icon opens the browser's own popover around the same form (`popovertarget`), so the search works from the first paint.
- **Logo**: the full logo in the header (40 px on a phone, 50 px on a computer), the footer and the coming-soon page; the mark only in the tab and home-screen icons. `docs/brand/brand.md` says so. The admin and its sign-in are FER-040's.
- **Carousels**: shadcn's Carousel, added with `pnpm dlx shadcn@latest add carousel` and moved to `molecules/carousel` (localized `aria-roledescription`, slides named "2 de 6", the arrow keys, a sideways trackpad swipe as one step, Tab following focus, a jump instead of a glide under reduced motion), on `embla-carousel-react` 8.6.0 and `embla-carousel-autoplay` 8.6.0, pinned exact. `molecules/store-article-row` (heading, "Ver todo", one round lime arrow that pages, then leads back to the start), `molecules/store-gallery` (the article's photos, rebuilt on it), `molecules/store-banner` and `molecules/store-cover-carousel` (a banner every six seconds; dots and a pause button; held while hovered, focused or dragged; still under reduced motion; one banner still, without controls; shown on `/design`). `molecules/store-slider` is deleted.
- **Card**: the photo cropped square on the tile, the white "Nuevo" label, the name in the wide face, the price in regular type; sold out, the name dims and the price line says "Agotado"; a reduced price after the one it had, struck through.
- **Catalog**: a centered title and one line, "Filtrar" opening a modal panel (a drawer from the left on a computer, a sheet from the bottom on a phone) that stays open while choices are made, "Ordenar por" opening a menu of links, the chosen choices as chips, a grid of four columns (two on a phone). The catalog's own search field is gone: the header's panel is the store's one search.
- **Article page**: the name, price, description and purchase in a column on the left and the photos on the right on a computer, the photos first on a phone; the related articles in a row whose "Ver todo" leads to the article's category.
- **Cart, checkout, order, 404, error, coming-soon**: the new palette, type and pill buttons (`atoms/store-button`). The home keeps its content (the store's name, tagline and description), now on the white page under the moss header, with a lime "Ver el catálogo"; its sections are FER-022's.
- **Footer**: moss with lime headings: the full logo and the tagline, the shop's links (the catalog and every category), help (how to order, WhatsApp), Instagram and TikTok (Lucide has no brand icons: a camera and a note, each with its name), "© store" and the credit.
- **Language pill** (Lucas, 2026-11-16): the header's "ENGLISH" link became the pill from FER-040 in the moss look, a lime hairline capsule with `ES` and `EN`, a lime thumb under the current language with its code in ink, the other code in lime, on the header from 768 px, in the phone menu and on the coming-soon screen; `store-shell.e2e.ts` switches language through it and back, keeping the query, on a computer and on a phone.
- **E2E**: `search-panel.e2e.ts` (by mouse and by keyboard, Escape handing focus back, the phone, without the script) and `catalog-filters.e2e.ts` (by keyboard, the drawer, the phone's sheet); the shell, home, catalog, article and design specs follow the new markup. The catalog spec's search test left with the catalog's search field; its search-and-back-button flow is the search panel's now.
- **Docs**: `design.md` § Storefront, `docs/brand/brand.md`, `docs/agents/nextjs.md` § Store pages, `docs/agents/testing.md`, `docs/project/overview.md`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
