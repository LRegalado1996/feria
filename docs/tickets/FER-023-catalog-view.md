# FER-023 Catalog view

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-021, FER-010, FER-033

## Goal

A shopper finds an article by browsing a category or typing a few letters.

## Scope

- `/{store}/products` with a grid of article cards: cover, title, price, an "unavailable" mark when it applies.
- Category chips, the store's filters (FER-033: color dots, material and so on) and a search box, all stored in the URL (`?category=collares&color=dorado&q=`). On mobile the filters open in a sheet; active ones show as removable chips with "clear all".
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

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
