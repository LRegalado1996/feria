# FER-040 Admin redesign

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-038, FER-039

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

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
