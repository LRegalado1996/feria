# FER-022 Home view

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-039, FER-020

## Goal

The home makes someone who scanned a QR at the stall want to keep scrolling, and gets them to an article in one tap.

Rewritten on 2026-11-16 to the structure of the reference store, with the components of [FER-039](FER-039-storefront-redesign.md).

## Scope

At `/`, top to bottom:

1. The announcement bar (in the shell) with the active announcement.
2. The cover: the cover carousel from FER-039 with the cover's banners, moving on its own; each is a full-width photo with its title and "Comprar ahora →" on the bottom-left corner. A single banner shows still.
3. A row of articles: heading, "Ver todo", cards that scroll sideways.
4. A banner placed between rows, full width.
5. The next row, and so on: rows and banners alternate in the order set in FER-020 (categories, best sellers, featured).
6. The footer's social block: Instagram, TikTok and a WhatsApp call to action.

Each section hides itself when it has no content, so a new store never shows an empty block; with no banner at all the home opens on its first row.

## Acceptance criteria

- Server-rendered, cached, and invalidated when curation or articles change.
- The cover's first photo is the page's priority image; its other photos and everything below load lazily with reserved space.
- One `h1`, ordered headings, real text in the HTML for every section.
- Smooth on a mid-range Android phone; rows work by touch, mouse, and keyboard.
- E2E in both languages with seeded content, and with an empty store.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
