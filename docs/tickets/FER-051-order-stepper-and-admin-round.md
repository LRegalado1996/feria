# FER-051 Order stepper, the order pages and an admin round

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-027, FER-043, FER-011, FER-045 (stacked after it)

## Goal

Anyone looking at an order knows where it is at a glance: the staff in the admin, who can also move it from the same picture, and the shopper on the order's own page. The admin's categories screen explains its icon buttons, says plainly when photos cannot be uploaded, and lets Lucas choose what the store's header shows.

Asked by Lucas on 2026-11-18, after reviewing the admin and the order page by hand; the decisions below are his. Visual references: https://landonorris.store for the storefront, Vercel's dashboard for the admin.

## Scope

**An order stepper** (a new component)

1. An order's status at a glance: circles joined by a line, a Lucide icon in each and the status's name small under it. Three steps and a detour (Lucas's choice): Recibido → Preparado → Entregado; an order that "No se pudo entregar" turns the last circle red, with an ✕ icon and that name. Steps not reached are grey, reached ones take colour as the order advances, the current one is clearly marked and carries `aria-current="step"`. It is announced as a list of steps with the current status in words; colour is never the only cue.
2. Two modes. **Interactive** (the admin): the circles are buttons that change the status, each change asked first in a confirmation dialog ("¿Pasar el pedido a Preparado?", confirm and cancel) before the existing `order.changeStatus` runs. Only the moves the order domain allows (`ORDER_MOVES`) are enabled, moving back included; the others are disabled with their reason in their accessible name and a tooltip. A stale move keeps today's handling: the CONFLICT is explained and the order read again. The detour can be chosen from the stepper. **Read-only** (the shopper's page): the same picture, no buttons.
3. Horizontal on a computer, vertical on a phone.

**The admin's order page** (`/admin/orders/{id}`)

4. The interactive stepper at the top, centered, under "Volver a pedidos", on a computer; on a phone, vertical at the bottom of the page's content, above the fixed action bar. Everything else stays as it is.
5. A button that copies the order's public link (`/orders/{token}`, in the order's language, absolute) to the clipboard, with a polite "copied" confirmation and, when the clipboard is refused, the link shown to copy by hand.

**The order's public page** (`/orders/{token}`)

6. The read-only stepper: horizontal on a computer, vertical at the bottom of the content on a phone.
7. "Seguir mirando la tienda" centered.
8. The article page's festive band (`molecules/store-article-band`, with its pause button), with clear room above and below.
9. Under the band, a row of articles from one category chosen at random, headed "Hacé todos los pedidos que quieras" ("Order as often as you like"), reusing the article row, without breaking caching or causing a hydration mismatch.

**The admin's categories screen** (`/admin/categories`)

10. Every icon-only button has a tooltip on hover and on focus saying what it does, in both languages, the same words as its accessible name.
11. Uploading a cover where the server has no `BLOB_READ_WRITE_TOKEN` fails clearly: `upload.createToken` answers a typed error, the uploader says "La subida de fotos no está configurada en este servidor" in both languages, and it is reported once, not as a crash. A real upload is checked end to end with a token set, and its test category deleted through the admin so its file goes.
12. A "Mostrar en el encabezado" checkbox for groups and categories in no group, checked for a new one (Lucas's choice); a category in a group always shows in its dropdown. The header and the phone menu list only those checked; every catalog page stays reachable. Schema change approved by Lucas: additive, default true, expand then contract. Set where the group is chosen, through the category procedures, authorized like the others.

## Out of scope

The storefront's header, phone menu, catalog grid, footer and checkout page (another branch works on them in parallel), except the header's data filter for item 12.

## Acceptance criteria

- The stepper shows each status, the detour included, with `aria-current="step"` on the current one; only allowed moves are enabled; nothing changes without confirming; the read-only stepper has no buttons. Unit tests fail when any of these rules is broken.
- E2E: an order's status changed through the stepper with its dialog, and a cancelled one; the public page's read-only stepper reflects a change made in the admin; the link copied; a category unchecked disappears from the header and keeps its page; the categories screen's tooltips on hover and on focus.
- The not-configured upload answers a typed error and shows its message, tested on both sides.
- Proof at 1440×900 and 390×844 on a production build, the admin in light and dark: the order page at each status and the detour, the dialog, the public page with the stepper, the band and the row, the categories screen with a tooltip and the checkbox, and the uploader's message.

## Decisions

_Filled in as the work lands._

## Outcome

_Filled in when the ticket closes._

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
