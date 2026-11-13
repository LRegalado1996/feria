# FER-023 Catalog view

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-021, FER-010

## Goal

A shopper finds an article by browsing a category or typing a few letters.

## Scope

- `/{store}/products` with a grid of article cards: cover, title, price, an "unavailable" mark when it applies.
- Category chips and a search box, both stored in the URL (`?category=`, `?q=`) so a filtered view can be shared.
- Sort: newest first by default, price ascending and descending.
- Infinite scroll on keyset pagination, with a "load more" button as the fallback.
- Empty and no-results states that offer a way forward.
- "Add to cart" directly from the card for available articles.

## Acceptance criteria

- The first page is server-rendered for every category URL, with its own title and description for search engines.
- Search is debounced, does not lose focus while results update, and the back button restores the previous filter and scroll position.
- E2E: filter by category, search, paginate, add to cart from the grid.
