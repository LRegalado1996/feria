# FER-064 The admin has one main landmark after navigating

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-013, FER-040

Refs: FER-013, FER-040

## Goal

However the person got to an admin screen, the page holds one `<main id="admin-main">`: the skip link lands on the screen being shown, and assistive technology finds one main landmark.

## The problem

Found on 2026-11-20 while checking the home stack (FER-020 to FER-060); it dates from the admin shell (FER-013, `a1591e2`), not from that stack.

Each admin page checks the session itself and renders `organisms/admin-shell`, because a layout does not re-render on navigation and must never be what keeps a page private (`src/app/[locale]/admin/layout.tsx`, `AGENTS.md` § Architecture). The shell draws `<main className="min-w-0" id="admin-main" tabIndex={-1}>` and the skip link `href="#admin-main"`. After client-side navigation, Next keeps the routes left behind mounted and hidden, so the document ends up with several shells, several `<main>` and several elements with the id `admin-main`. The ids are duplicated (invalid HTML), the skip link jumps to the first one in the document, which can be a hidden screen's, and a screen reader's landmark list can offer more than one main.

## Scope

Pick one of the two, measured against what the shell needs:

1. **The `<main>` in the admin layout.** The layout renders only chrome, the landmark and the skip link (no session, no data: allowed by the rule above), and each page renders its shell's contents inside it. One `<main id="admin-main">` for the whole admin, whatever is kept mounted. Needs the shell split into the layout's frame and each page's part, and a check that a hidden kept route's content is not inside a visible landmark twice.
2. **No fixed id.** Each shell's `main` gets an id of its own (`useId()`), and its skip link points at it; hidden routes keep their own landmark, but the browser hides them (`hidden`/`display: none`), so assistive technology and the skip link only meet the visible one. Smaller change; relies on Next hiding kept routes from the accessibility tree.

## Acceptance criteria

- After navigating between three admin screens and back, `document.querySelectorAll("#admin-main")` (or the chosen id) matches one element, and the accessibility tree has one main landmark.
- The skip link moves focus into the screen being shown, on the first load and after navigation.
- E2E covers both, at phone and computer width.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.

## Outcome

Option 2. Option 1 would set the sidebar, with the signed-in login, inside the main landmark, or read the session in the layout. `molecules/admin-frame` (a client component) draws the skip link, the sidebar and `<main>`, and the landmark's id is `useId()`'s. A screen kept hidden keeps its own landmark and id, `display: none`, out of the accessibility tree.

Found along the way: on a phone, choosing a section in the menu loaded the whole document again. The menu closed on the click's way down (`onClickCapture`), a real click commits between the phases, and the link was gone before its handler could navigate in place. The menu now closes on the way up (`onClick`). The store's phone menu (`molecules/store-mobile-menu`) and the cart panel (`organisms/store-cart-panel`, a link to another page) had the same fault and close the same way; the panel still holds a link to the page already open on the way down, so it navigates nowhere.

The store had the same repeated id (`store-main`, on every kept page's frame): `atoms/store-skip-link` now has a scope (`StoreSkipScope`, in `organisms/store-frame` and the design gallery) that gives the skip link and its target (`StoreSkipTarget`) an id of their own.

Tests: `src/e2e/tests/store/store-main-once.e2e.ts` covers the store's content and skip link after three pages and back, at both widths. `src/e2e/tests/admin/admin-landmark.e2e.ts` covers the landmark and the skip link at a phone's and a computer's width. `fixtures/expect-in-place.ts` asserts that following a link loads no new document, for the admin's sections, the store menu's home link (`store-shell.e2e.ts`) and "Hacer el pedido" (`cart-panel.e2e.ts`). A unit test cannot see the fault with a dispatched click, which runs no microtasks between the phases; `src/test/browser-click.ts` commits there, as a browser does.
