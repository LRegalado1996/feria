# FER-022 Home view

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-021, FER-020

## Goal

The home makes someone who scanned a QR at the stall want to keep scrolling, and gets them to an article in one tap.

## Scope

In order, top to bottom:

1. Hero banner carousel from the active banners: swipe, autoplay that pauses on interaction, giant display headline.
2. Marquee band with the store's tagline.
3. Featured articles in large editorial slots.
4. One horizontal slider per category that has published articles, each ending in "see all".
5. Best sellers as a numbered ranking in display type.
6. Social block: Instagram and TikTok links and a WhatsApp call to action.

Each section hides itself when it has no content, so a new store never shows an empty block.

## Acceptance criteria

- Server-rendered, cached by store, and invalidated when curation or articles change.
- The first banner image is the page's priority image; everything below loads lazily with reserved space.
- One `h1`, ordered headings, real text in the HTML for every section.
- Smooth on a mid-range Android phone; sliders work by touch, mouse, and keyboard.
- E2E in both languages with seeded content, and with an empty store.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
