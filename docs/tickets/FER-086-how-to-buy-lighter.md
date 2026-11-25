# FER-086 A lighter "how to buy" block and smaller cover controls

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-076

## Goal

The home's "how to buy" block reads at a glance and stays out of the way: thin, clean, with icons like the order's stepper, instead of a tall moss block with a title, figures, payment pills and a button.

## Decision

2026-11-25, Lucas, looking at the demo: "más finito con unos iconos, más parecido a lo que hacemos con el estado del pedido". Then, over three rounds:

- A compact list of small circles with an icon, on a light background.
- No visible title ("Comprá en 3 pasos" goes), no payment pills and no "Ver el catálogo" button: the steps are the whole block.
- A fourth circle for paying.
- Each step in two lines on a computer: its name and one short line.
- No hairlines above and below; a light background of its own, apart from the page's white.
- Flush against the cover: no strip of white between them.
- The paying line says the store takes every way to pay: "Aceptamos todos los medios de pago."
- The cover's dots and pause button, "muy grande", a little smaller.

Taken while building:

- The background is the photos' grey tile (`store-surface`), the one light grey the store already has.
- The block keeps a title for a screen reader and a crawler, "Cómo comprar" (`howToBuy.label`), hidden from the eye.
- The step words got shorter so each fits one line at 1280 px and up: "Te lo entregamos / En el puesto o te lo mandamos." and "Pagá como quieras / Aceptamos todos los medios de pago.". The contact page shows the same steps (its first three), so its words change with them; its title "Comprá en 3 pasos" and its payment pills stay.
- Only "how to buy" drops the gutter under a cover: a banner or a spotlight under another picture keeps it, so two pictures never fuse.
- The cover's controls shrink from `md` up only (a 36 px pill instead of 48, 32 px targets): on a phone they stay 44 px targets, the size a thumb needs, as every storefront control there.

## Scope

- `molecules/store-how-to-buy`: the four circles, no title on screen, no link, no payments; its props lose `href`.
- `molecules/store-page-sections`: the gutter only between pictures.
- `molecules/store-cover-carousel`: the controls' size from `md` up.
- The copy in `src/content/{es,en}/storefront.ts` (`howToBuy`) and the admin's note for the block (`admin.ts`).
- The `/design` page, `design.md`.

## Acceptance criteria

- On the home, the block touches the cover: no white between them.
- Four steps in order, paying last, each an icon in a moss circle with its name and one line; no visible title, no link.
- Four in a row at 1280 px and up, each step on two lines; two by two on a narrow block; stacked on a 360 px phone, with no sideways scroll.
- A screen reader and a crawler that runs no script find the block by its title, "Cómo comprar", and its four steps.
- In English, the same in English.
- On a computer the cover's controls are a 36 px pill; on a phone they stay 44 px targets.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
