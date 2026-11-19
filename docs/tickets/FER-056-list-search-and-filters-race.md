# FER-056 A pending search and "Aplicar" can lose each other

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-019

## Goal

On the admin's article list ([FER-019](FER-019-article-list.md)), the search and the filter sheet each write the whole address from the selection they last rendered, and neither knows the other's change still on its way, so the settled address must keep both. Typing in the search starts a 300 ms wait (`SEARCH_DEBOUNCE_MS`, `useSearchField`), after which `molecules/product-search` navigates with `router.replace`; "Aplicar" in `molecules/product-filter-panel` navigates with `router.push`. If "Aplicar" is pressed within those 300 ms of the last keystroke, or while the search's replace is still committing, whichever navigation commits last wins: the address can keep the filters and drop the search (or keep `q=aro` and lose `status=published`). The window is narrow: a person types, then opens the sheet, chooses and presses "Aplicar" in well under a third of a second, or presses it while the replace is in flight. Found by CodeRabbit on PR #65; nobody has hit it by hand.

## Scope

- One place that merges both into the address: the list holds the pending search and the applied filters, and each control asks it for a change rather than building the URL itself; or "Aplicar" flushes the pending search first and builds its address from it.
- Whichever way, the search's replace and Apply's push never overwrite a change the other made.
- A unit test for each order (Apply within the wait, the wait ending after Apply's push) and an e2e that types and applies at once.

## Acceptance criteria

- Typing a search and pressing "Aplicar" at once, in either order, leaves an address with both the search and the filters, and the list shows that selection.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
