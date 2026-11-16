# FER-021 Storefront shell

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** in progress
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
- **Pending:** "Lighthouse on mobile for an empty store: performance and accessibility at 95 or above" was not measured: Lighthouse is not part of this repo's tooling, and Lucas decided it is not a dependency (2026-11-14). The ticket stays in progress until someone runs it.
- The catalog (`/{store}/products`) and cart (`/{store}/cart`) the header links to arrive in FER-023 and FER-026, later in the same stack; until then they answer the store's 404.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
