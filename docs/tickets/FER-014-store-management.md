# FER-014 Company settings

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-038, FER-040

## Goal

The store keeps its own details up to date from `/admin/settings`.

Rescoped on 2026-11-16: the site is one store ([FER-038](FER-038-single-store.md)), so creating, activating and choosing stores is gone, and so is the theme editor (colors and logo are code).

## Scope

- Name, tagline and description in both languages, WhatsApp number, Instagram and TikTok links.
- Currency: Uruguayan pesos or US dollars. Changing it later does not convert existing prices, so the screen warns, asks for confirmation, and lists how many articles will need a new price. Past orders keep the currency they were placed in.
- WhatsApp number validated and stored in international format.
- Saving invalidates the cached store so the storefront updates at once.
- The form sends every field it loaded, and two people editing must not silently undo each other: refuse a save made from a stale copy (compare `updatedAt`) and say so.
- Built in the admin shell and cards of [FER-040](FER-040-admin-redesign.md).

## Acceptance criteria

- A changed tagline shows in the storefront's footer on the next visit.
- A stale save is refused with a message, and a test fails when that rule is removed.
- E2E: change the WhatsApp number, see the footer's link follow.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
