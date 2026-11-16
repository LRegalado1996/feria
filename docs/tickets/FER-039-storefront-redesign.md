# FER-039 Storefront redesign

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-038

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

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
