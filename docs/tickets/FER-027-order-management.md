# FER-027 Order management in the admin

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
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

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
