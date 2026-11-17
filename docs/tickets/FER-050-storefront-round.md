# FER-050 Storefront round: header, phone menu, catalog, footer, order confirmation

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-044, FER-045 (stacked after them)

## Goal

The store reads and behaves as Lucas expects after going through it by hand: every control in the header looks clickable, the phone menu opens on the brand, the catalog shows bigger photos on a phone, the footer reads as separate parts on a phone, and nobody sends an order by accident.

Asked by Lucas on 2026-11-18. The visual reference stays https://landonorris.store (structure and feel, never its logo, photos or licensed typeface).

## Scope

**Header**

1. Hovering "Bijouterie" (the group's dropdown control on a computer) shows the hand cursor, like every other link in the header.

**Phone menu (the hamburger panel)**

2. At the top of the panel, the "Inicio" link becomes the LR Market logo (the full logo, `atoms/store-logo`), centered, with clear space under it to separate it from the links. Tapping the logo goes home and closes the panel. Its accessible name says it leads home ("LR Market, inicio" / "LR Market, home", from `src/content`).
3. The language pill sits in the panel's bottom-left corner.

**Catalog on a phone**

4. Below `sm` (a phone), the grid shows one article per row, so they are larger. From `sm` (tablet) it keeps two per row, and on a computer what it has now (four). The infinite loading still triggers at the right distance with taller rows, and the cover still leaves the first row hinting below the fold.

**Footer on a phone**

5. Below `lg`, the footer's parts stack one under the other, each with clear space between it and the next so they read as separate things:
   - the story with its signature;
   - "Tienda": the title on its own line, then the three links (Catálogo, Burbujeros, Bijouterie) on one line below it, side by side, wrapping only if they cannot fit at 320 px;
   - "Ayuda": the title, then its text.

   When the store has social links, "Seguinos" follows the same pattern. The desktop layout (`lg` and up, one row across the full width) stays exactly as it is.

**Checkout page** (`/cart`)

6. Before the order is sent, a confirmation dialog asks the shopper to confirm. It shows a short summary: the number of units, the total, and the name and mobile they typed. Its two actions are "Confirmar pedido" and "Volver" ("Confirm order", "Go back").
   - Only on confirm is the order created, through the existing submit path with its request key, limits and price checks, all untouched. Then the browser goes to the order's page, as it does today.
   - "Volver" closes the dialog and keeps everything typed.
   - The dialog traps focus, closes on Escape, returns focus to the submit button, and is announced as a dialog with a title.
   - The form's validation still runs before the dialog opens: an invalid form shows its field errors and no dialog.

## Out of scope

The public order page (`/orders/{token}`) and the admin: another branch works on them in parallel.

## Acceptance criteria

- The group's control on the header's line shows the hand cursor.
- E2E: the phone menu's logo leads home and closes the panel; the language pill sits in its bottom-left corner; the catalog is one column at 390 px and two at 768 px; the footer's parts stack at 390 px, the shop's links on one line; the checkout: submit, the dialog shows the summary, "Volver" keeps the form, confirming places the order and lands on the order's page.
- Unit tests fail when the logo stops leading home, the pill leaves its corner, the phone grid gets two columns, the footer stops stacking, or an order is created without confirming or the form is cleared on "Volver".
- Proof at 390×844 (and 1440×900 where it applies) from a production build: the phone menu open, the catalog at 390 and 768, the footer at 390, the header's hover on Bijouterie, the checkout with the dialog open.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
