# FER-088 The article list's links keep a search still on its way

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-056

## Goal

[FER-056](FER-056-list-search-and-filters-race.md) made the search and "Aplicar" change the article list's address through one place (`useProductsAddress`), each on the newest selection asked for. The list's links still build their address from the selection they rendered: the active filters' chips and "Limpiar todo", the numbered pages, the column headers and "Ordenar". A link followed within the search's 300 ms wait, or while its replace commits, can drop the search: if the replace commits first and the link second, the address ends without `q`, and the field, seeing a search it did not send, empties. Found by the local review of FER-056, 2026-11-25; nobody has hit it by hand.

## Scope

- A plain click on any of the list's links (a modified click still opens its own tab) asks `useProductsAddress` for its change instead of navigating to the address it rendered, or the pending search is sent first and the link built from it.
- The links stay links: their `href` is still the address they lead to, for a new tab, a copy and a browser without the script.

## Acceptance criteria

- Typing a search and, at once, removing a chip, changing the page or sorting by a column leaves an address with both the search and that change, and the field keeps what was typed. A unit test for each order and an e2e that types and removes a chip at once.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
