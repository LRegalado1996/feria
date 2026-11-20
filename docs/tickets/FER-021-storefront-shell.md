# FER-021 Storefront shell

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-008, FER-005

## Goal

Every public page of a store shares one header, footer and feel.

## Scope

- Header: store logo, links to home and catalog, search entry, locale toggle, cart button with item count. Sticky, with a full-screen menu on mobile.
- Footer: Instagram and TikTok links, a WhatsApp contact link, the store's tagline, a discreet "made by Lucas Regalado" credit linking to the personal site.
- Page transitions and the reveal behaviour from FER-005.
- Store-aware `not-found` and `error` pages.
- Per-store metadata defaults: title template, description, share image, theme color.

## Acceptance criteria

- The shell renders from server components; only the menu, the toggle and the cart count hydrate.
- Social links appear only when the store has them set.
- Lighthouse on mobile for an empty store: performance and accessibility at 95 or above.
- E2E: navigation, mobile menu, locale toggle keeping the store.

## Outcome

- `organisms/store-header`: the store's logo (`logoUrl`) or, without one, its name in the display face, linking home; Inicio and Catálogo; a search entry that is a plain form opening `/{store}/products?q=` (`molecules/store-search-form`; on a computer it works before the page's script loads, on a phone it sits in the menu, which needs it); the language link in the store's colors (`molecules/store-locale-toggle`, which keeps the store, the path and the query string); and the cart (`molecules/store-cart-button`) with how many units it holds. Sticky, with a skip link to the content. On a phone the links, the search and the language move into a full-screen menu (`molecules/store-mobile-menu`) that renders in place to keep the store's palette and closes when a link inside is followed.
- `organisms/store-footer`: the tagline in the page's language, Instagram, TikTok and a WhatsApp chat (`https://wa.me/…`) each only when the store has it, and "Hecho por Lucas Regalado" linking to https://lucasregalado.com.
- The cart lives in the browser, one per store (`useCart`, `src/lib/hooks/cart/use-cart.ts`, key `feria:cart:<slug>`): articles and quantities, never a price, parsed with `cartSchema` (the order's own caps) so a cart anything else wrote is an empty cart, and a change that would not parse back (a quantity of 0, 1.5 or more than 10) is refused instead of written; where the browser refuses storage, the cart lives in the page until it is left. Tabs stay in sync. The header reads the count as units ("Carrito, 3 unidades"). The server renders the count empty and the browser fills it, so the store pages stay static (`docs/agents/nextjs.md` § Store pages). The drawer and checkout are FER-026.
- `[store]/not-found.tsx` and `[store]/error.tsx` show inside the store's header and footer (`organisms/store-status-page`); `[store]/[...rest]` sends any address under a store that no page answers (a typo, an old link) there too, with a 404. An address that is not a store keeps the app's own 404.
- Per-store metadata: titles end in `· <store>` (the home is the store's name alone), the description is the tagline, the browser's bar takes the store's background (`themeColor`), and `[store]/opengraph-image.tsx` draws a share card with the store's name and tagline in its colors, its alternative text the store's name. The footer's links say, to a screen reader, that they open in another tab.
- E2E (`src/e2e/tests/store/store-shell.e2e.ts`): the header's links and skip link, the phone menu, the language link keeping the store, the footer's links, the cart count.
- **Lighthouse, measured locally on 2026-11-19** (Lucas's decision that day: measure locally to close the ticket, the production measurement later). Lighthouse 13.6.0 run one-off outside the repo (it stays out of the tooling), its mobile profile with its simulated throttling, against a production build (`next start`) of the home stack (FER-020, FER-034, FER-022, FER-053) and the seed's database, the median of three runs. The criterion's page, the home of a store with nothing to show (every article a draft, every banner off, so `organisms/store-intro`): performance 100, accessibility 100, best practices 100, SEO 100. **Still owed:** the same measurement on production.
- Measured beside it, past the criterion, with the seed's content (performance, accessibility; best practices and SEO 100 on each): the home 86 and 100, `/productos` 87 and 100, a category page (`/bijouterie/anillos`) 86 and 100, an article 88 and 100. Behind an HTTP/2 front (Vercel serves HTTP/2; `next start` serves HTTP/1.1, which Lighthouse models as six connections) the same pages score 91 to 93. Each one's largest paint is its first photo (the cover, the catalog cover, the gallery), which Lighthouse's simulation finishes only after the page's JavaScript (about 345 KB compressed: React, the router, the shell's and the page's components, Sentry); with scripts blocked it falls from 3.2 s to 1.7 s. Inlining the CSS (`experimental.inlineCss`) scored lower and Sentry's component annotations made no difference, so neither changed. Reaching 95 there means shipping less JavaScript to the store's pages; the production measurement says whether it is needed.
- The catalog (`/{store}/products`) and cart (`/{store}/cart`) the header links to arrive in FER-023 and FER-026, later in the same stack; until then they answer the store's 404.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
