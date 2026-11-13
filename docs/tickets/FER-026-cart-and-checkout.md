# FER-026 Cart and checkout

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-025, FER-023, FER-024

## Goal

A shopper goes from "I want this" to a confirmed order in under a minute, without creating an account.

## Scope

- Cart kept in the browser per store, validated by a schema on read, surviving reloads. A drawer shows items, quantities, subtotal and "place order".
- On opening the cart, prices and availability are refreshed from the server; changed or unavailable items are flagged before checkout.
- Checkout form: name, mobile number, optional note. The phone field is forgiving about format.
- On submit the order is created (FER-025), the cart is cleared, and the shopper lands on `/{store}/orders/{token}`.
- Confirmation page: a clear "order received" banner, the order code, the items and total, what happens next (the store will contact them), and the order's current status, so the link stays useful.
- When phone verification is enabled (FER-028) the same page shows the code form. When it is not, only the confirmation banner shows.
- A secondary "contact the store" link opens a WhatsApp chat with the store when it has a number set. It is a convenience, not how the order travels: the store reads orders in the admin (FER-027).
- Copy in both languages.

## Acceptance criteria

- The whole flow works on a phone with one hand.
- Submitting twice (double tap, back and resubmit) creates one order.
- The order appears in the store's admin without the shopper doing anything after submitting.
- E2E: add two articles, change a quantity, place the order, check the confirmation page.

## Notes

The order page is reached without a login, so it is addressed by `token`, is not indexed, and shows the phone number partly masked.
