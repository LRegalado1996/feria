# FER-055 Swiping over the wizard's photos scrolls

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-017

## Goal

On a phone, a swipe that starts on a photo in the wizard's grid ([FER-017](FER-017-article-wizard.md), `molecules/product-photo-grid`) should scroll the page, and only a held press should pick the photo up to reorder it. Today the photo is the drag handle with `touch-none` (CSS `touch-action: none`), and dnd-kit's `PointerSensor` also takes touch pointers, so a swipe over the photos neither scrolls nor waits for the `TouchSensor`'s 200 ms delay: a move past six pixels can start a drag instead. Found by CodeRabbit on PR #64; Lucas did not report it while trying the wizard from a phone, so how much it bothers is unknown.

## Scope

- `MouseSensor` for a mouse and the delayed `TouchSensor` for touch (instead of `PointerSensor` taking both), and native panning allowed on the photo (`touch-action: manipulation` or `pan-y`), keeping the keyboard sensor and the buttons as they are.
- An e2e at 390 px with touch: a quick swipe over a photo scrolls without reordering, a held press reorders.

## Acceptance criteria

- On a real phone, the page scrolls when a swipe starts on a photo, and a held photo can still be dragged.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
