# FER-023 Catalog view

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-021, FER-010, FER-033

## Goal

A shopper finds an article by browsing a category or typing a few letters.

## Scope

- `/{store}/products` with a grid of article cards: cover, title, price, an "unavailable" mark when it applies.
- Category chips, the store's filters (FER-033: color dots, material and so on) and a search box, all stored in the URL (`?category=collares&color=dorado&q=`). On mobile the filters open in a sheet; active ones show as removable chips with "clear all".
- The page builds `catalog.products`' `filters` from the query string itself: every parameter that is not `category`, `q`, `sort` or `cursor` and whose name and values are well-formed slugs, at most 10 filters of 20 values (FER-033). Anything else (`fbclid`, `utm_source`, a stray capital) is dropped, never sent: the API refuses a malformed filter, and a shared link must never break the page.
- A share button on any filtered view: the native share sheet on phones, copy link elsewhere.
- A filtered view has its own heading, page title and share card ("Gold necklaces"), so the link looks right when pasted into WhatsApp.
- Sort: newest first by default, price ascending and descending.
- Infinite scroll on keyset pagination, with a "load more" button as the fallback.
- Empty and no-results states that offer a way forward.
- "Add to cart" directly from the card for available articles.

## Acceptance criteria

- The first page is server-rendered for every category URL, with its own title and description for search engines.
- Search is debounced, does not lose focus while results update, and the back button restores the previous filter and scroll position.
- Opening a shared link such as `?category=collares&color=dorado` shows exactly that selection on first load, in either language.
- E2E: filter by category and color, share the link, open it fresh, search, paginate, add to cart from the grid.

## Outcome

- `/{store}/products` (`organisms/store-catalog`): a grid of cards (cover, title, price, "Agotado" when the article cannot be bought, and "Agregar" for one that can), the category chips, the store's filters with their swatches and counts, and a search, all in the address (`?category=collares&color=dorado,violeta&q=`). On a computer the choices sit in a sidebar; on a phone they open in a full-screen sheet. The chosen ones show as removable chips with "Limpiar todo".
- The address is read with `readCatalogQuery()` (`src/lib/catalog/query.ts`): every parameter other than `category`, `q`, `sort` and `cursor` whose name and comma-separated values are slugs is a filter, at most 10 of 20 values; anything else (`fbclid`, `utm_source`, a capital) is dropped, and a category or value the store does not have is ignored (`knownOnly`), so an old link still lists. `catalogHref()` writes a selection back as one stable link.
- The first page of every selection is rendered on the server, with its own heading, title and description ("Collares · Dorado", "Collares · Dorado, en LR Market."), and alternates that keep the selection without the search and the sort. The page reads the query string, so it renders per request (`docs/agents/nextjs.md` § Store pages).
- Sort: newest first, price low to high, price high to low. The API gained `sort`; its keyset cursor carries the sort's own key (`publishedAt` or `priceAmount`, then the id) and a cursor from another sort is refused.
- The next page loads as the grid's end scrolls into view, with "Cargar más" as the fallback and a retry when a page fails.
- Search: the address follows the typing after 300 ms, replacing the history entry, and the field keeps focus; before the page's script loads it is a plain form that keeps the rest of the selection. Category and filter choices are links, so the back button restores the previous selection.
- Share: the phone's share sheet when the browser has one, else the link copied and said.
- Empty and no-results states: "Todavía no hay artículos", or "No encontramos nada" with a link to the whole catalog.
- The card (`molecules/store-article-card`) and the price (`atoms/store-price-tag`) take their words as props, so they render in the browser too, as the grid's later pages need.
- E2E (`src/e2e/tests/store/catalog.e2e.ts`): filter by category and color and open the link fresh in English, a link with stray parameters, search with focus and the back button, sort and paginate, add to cart from the grid, share by copying.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
