# FER-027 Order management in the admin

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-026, FER-013

## Goal

The store sees every order and moves it through its states with one tap, from the phone at the stall.

## Scope

- `/admin/{store}/orders`: newest first, with code, customer name, total, time, status and a "phone confirmed" indicator (yes or no).
- Tabs or filters by status with counts; search by code, name or phone.
- Order detail: items, total, note, customer contact with "open WhatsApp chat", status history with who changed it and when.
- One-tap status buttons showing only the allowed next moves: received, packed, delivered, undeliverable. Changing to undeliverable asks for confirmation.
- This screen is the only place a new order is announced, so the list refreshes on its own while open, new orders are highlighted, the navigation shows a count of orders still in `received`, and an optional sound plays on arrival.
- States carry a text label and an icon, never color alone.

## Acceptance criteria

- Marking an order as packed takes two taps from the list on a phone.
- The shopper's order page (FER-026) reflects the new status.
- E2E: an order placed on the storefront appears in the admin and is taken to delivered.

## Out of scope

Push, email or WhatsApp notifications for new orders: worth a follow-up ticket if orders get missed at the stall. Exports and sales reports.

## Outcome

- `/admin/{store}/orders` (`organisms/order-manager`): newest first, each row with its code, the customer's name, the total, how long ago, the status (an icon and a label, never color alone) and whether the phone is confirmed. Tabs "Todos" and one per status with their counts; a search by code, name (blind to case and accents) or phone (as typed locally or in its 00 form); both live in the address, and opening an order and coming back keeps them.
- `/admin/{store}/orders/{id}` (`organisms/order-detail`): the items and total, the note, the customer's name and full phone (a `tel:` link) with "Abrir chat de WhatsApp" in the shopper's language, the status history with who made each move and when, and one button per allowed move (`molecules/order-status-actions`); "No se pudo entregar" asks first. Two staff on the same order: the page refreshes on its own and a move that no longer applies says someone already changed it.
- New orders: the list and the counts refresh every 15 seconds while the screen is in view. An order this tab had not seen, placed after the newest its list had shown, is marked "Nuevo" (until it is opened, leaves "recibido", or after ten minutes) and announced to screen readers; an optional beep (off by default, remembered per browser) plays on arrival, and after a reload it waits for the first touch, saying so. The navigation shows how many orders are still to prepare (`molecules/orders-pending-badge`).
- Server: `order.list` takes a search, `order.counts` answers every status's count (`docs/agents/security.md`: both are `storeProcedure`, filtered by the store).
- E2E (`src/e2e/tests/admin/orders.e2e.ts`): an order placed on the storefront appears in the admin and is taken to delivered in two taps per move, the shopper's page following; undeliverable asks first; tabs, counts and search; the navigation's count; an order arriving while staff are on another order; another store's member never sees it.
- **Pending:** none of the acceptance criteria. Push, email or WhatsApp notifications stay out of scope, as the ticket says.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
