# FER-050 Storefront round: header, phone menu, catalog, footer, order confirmation

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
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

## Decisions

- **Every storefront button shows the hand, not only Bijouterie's.** A button keeps the arrow by default, so the same gap was on the search, the menu and the cart panel's controls; `atoms/store-button` and both of the group's controls now say `cursor-pointer`.
- **"From `sm` two, on a computer four" puts the four columns at `lg`.** Asked for two at 768 px, the grid is one column below `sm` (640), two from `sm` and four from `lg` (1024), where it had four from `md` (768). The photos ask for 100vw, 50vw and 25vw at those widths.
- **The next page still starts 800 px before the list's end.** One article a row on a phone is about 470 px tall, so that is a row and a half ahead; the e2e proves it loads with the end still 700 px below the window. The cover's height is unchanged, so the first row still shows about 70 px at 390×844.
- **The phone footer's blocks are apart by room and a hairline**, after the reference store's phone footer: 32 px under each, a hairline (`store-background/15`), 32 px over the next. The shop's three links fit one line at 320 px (checked on the seeded store).
- **The confirmation is a dialog, not an alert dialog, that a tap on the scrim does not close.** It is announced as a dialog with its title and a description ("te escribimos a ese celular por WhatsApp"). The second tap of a double tap on "Hacer el pedido" lands on the scrim, which would close what the first opened; Escape and "Volver" close it.
- **Focus starts on "Volver"**, the choice that sends nothing, so a stray Enter cannot place an order; it returns to "Hacer el pedido" on close, whether the submit came from the button or from Enter in a field.
- **The dialog stays open while the order is sent.** "Confirmar pedido" says "Enviando el pedido…" and stays focusable (`aria-disabled`), so a double tap on it is dropped by the form's guard; "Volver" and Escape are held, since a sent order cannot be taken back. A failure closes it, and the reason shows under the form as before; a success moves on to the order's page.
- **A cart held while the dialog is open** (its prices read again) closes it on "Confirmar pedido" without sending; the reason shows under the button.
- **The summary reads the cart as it is now**: the units add every line's quantity, the total is the checkout's; without a total (no prices yet) the row is left out.

## Outcome

- **Header** (`molecules/store-nav-group`, `atoms/store-button`): the group's control on the line, its button in the phone menu and every storefront button show the hand on hover.
- **Phone menu** (`organisms/store-header`): the full logo, 64 px tall, centered at the top of the panel with 32 px under it, named "LR Market, inicio" / "LR Market, home" (`shell.menuLogo`), leads home and closes the panel; "Inicio" is no longer a link there. The language pill sits in the panel's bottom-left corner (`mt-auto`).
- **Catalog** (`organisms/store-catalog`): one article a row below `sm`, two from `sm`, four from `lg`.
- **Footer** (`organisms/store-footer`): below `lg` the story, "Tienda", "Ayuda" and "Seguinos" (when the store has follow links) stack, apart, each title on its own line and its links side by side under it; from `lg` up the row is as it was.
- **Checkout** (`molecules/store-checkout-confirm`, `molecules/store-checkout-form`): a valid submit opens the confirmation (units, total, name, mobile; "Confirmar pedido", "Volver"), and only confirming sends the order through the unchanged path (request key, limits, price checks). An invalid form shows its errors and opens nothing.
- **E2E**: `tests/store/store-shell.e2e.ts` (the menu's logo home and the pill's corner at 390 px; the footer stacked at 390 px, its links side by side), `tests/store/catalog.e2e.ts` (one, two and four a row at 390, 768 and 1440 px; the next page at 700 px from the end on a phone), `tests/store/checkout.e2e.ts` (invalid opens nothing; the summary; "Volver" and Escape keep the form and send nothing; confirming places the order and lands on its page; a double tap on each places one order), `tests/store/catalog-pages.e2e.ts` (the group's hand). The specs that placed an order (`cart-panel`, `checkout`, `admin/orders`) confirm it through `StorePage.submitAndConfirmOrder()`.
- **Docs**: `design.md` § Storefront (the button, the group, the phone menu, the grid, the footer, the checkout and its confirmation), `docs/project/overview.md`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
