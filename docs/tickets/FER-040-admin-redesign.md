# FER-040 Admin redesign

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-038 (built before FER-039, which it does not need: the admin's logo and tokens are its own)

## Goal

The admin feels like Vercel's dashboard on a computer and is effortless on a phone at the stall.

Decided by Lucas on 2026-11-16.

## Scope

- **Computer:** a full-height sidebar: the full LR Market logo on top, the sections each with an icon and the orders' count, the signed-in login with the language link, the theme toggle and sign out at the bottom. A quiet grey canvas; content in white cards with a hairline border; a top bar with the page's title and its main action.
- **Phone:** the sidebar is hidden behind a menu button in a sticky top bar and opens as a panel that closes when a section is chosen. Lists become stacked cards; a section's main action stays within thumb reach.
- No quick-find box (Lucas: not needed).
- The screens that exist take the new shell and cards: sign-in, orders and the order's detail, categories, filters, and the "Coming soon" sections.
- Light and dark both hold, as today.
- **Docs:** `design.md` (admin shell, cards, navigation) so the screens still to come (FER-014, 015, 017, 019, 020, 030) are built in it.

## Acceptance criteria

- Usable at 375 px with one hand: every action reachable, 44 px touch targets, no sideways scroll.
- The menu panel traps focus, closes on Escape and returns focus to its button.
- Existing admin e2e specs pass; a new one covers the phone menu.
- The PR carries one image composing every changed screen, phone and desktop.

## Outcome

- **Shell** (`organisms/admin-shell`): from `md` up a sidebar the height of the window: the full LR Market logo at 96 px with its clear space, the eight sections with a Lucide icon each (the orders first, where `/admin` opens, with their count of orders to pack), and at its foot the signed-in login's name and email (`admin.me` now answers the email too), the language link, the theme toggle and sign-out. No quick-find box. The canvas and the sidebar are the `sidebar` token (a very light grey; in dark the page's black), content sits in white cards with a hairline border.
- **Top bar** (`molecules/admin-page`): sticky, with the page's one heading and its controls; a screen's main action is at its end on a computer and in a bar along the bottom of a phone's screen, under the thumb: an order's moves, and "Nueva categoría" / "Nuevo filtro", which bring the add form into view and focus its first field.
- **Phone** (`molecules/admin-menu`): the menu button in the top bar opens the sidebar's content as a modal panel from the left; it traps focus, closes on Escape, on the dimmed area, on its close button and on choosing a section or the language, gives focus back to the button, and closes if the window widens to the sidebar's layout. It slides in and leaves at once: with an exit animation, a section chosen left the closed panel mounted in the hidden page behind (9 runs in 10 of its e2e). The orders and the categories become stacked cards; the orders are columns under their names from `xl` up (at `lg` the fixed columns, beside the sidebar, left the customer's name 14 px). Every control is a 44 px target below `md`: `atoms/button` and `atoms/input` carry it, and so do menu items, a dialog's close button and the password field's reveal button.
- **Screens:** sign-in (logo, the form in a card, the language and the theme), the orders and an order (the order's parts in cards, two columns from `lg` up), categories, filters and the "Próximamente" sections take the shell and the cards. The orders screen keeps everything it did (live arrivals, the "Nuevo" mark, the sound, the status tabs and the search in the address); only its look changed: the sound switch sits in the top bar (its words only for the ear on a phone, with its hint under the bar), the tabs and the status are pills.
- **Tests:** unit tests for every new and changed component; `src/e2e/tests/admin/phone.e2e.ts` covers the phone menu (focus kept inside, Escape, the dimmed area, the close button, a section chosen), 44 px targets and no sideways scroll on every screen at 375 px, the sign-in included, and the main action under the thumb; the specs that read the sections, the language and sign-out from a phone's header now open the menu, and the brand spec checks the sidebar's full logo at 96 px.
- **Also:** the filters screen's example link no longer names a store (`/products?color=dorado`), left over from FER-038.
- **Docs:** `design.md` § Admin (shell, canvas and cards, top bar, the main action under the thumb, the phone menu) and its tokens, type, touch-target and reference lines; `docs/agents/nextjs.md` § Admin pages.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
