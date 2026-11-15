# FER-026 Cart and checkout

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** in progress
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

## Outcome

- **The cart is a page, `/{store}/cart`, with the checkout on it** (`organisms/store-cart`), not a drawer: the header's cart already linked there (FER-021), a page is an address the back button and a shared tab understand, and one page from articles to "Hacer el pedido" keeps the order to one screen and one thumb. Reversible: the same organism fits in a sheet.
- On opening, the cart reads its articles from the shop (`catalog.cartProducts`, `listCartProducts`): their price now and whether they can be bought. A line says when the price changed since it was added (the cart keeps the price seen when adding, `seenPriceAmount`, never charged), when the article is sold out, or when it is gone; a sold-out or gone article holds the order until it is taken out, since the server would refuse it.
- Checkout (`molecules/store-checkout-form`): name, mobile (any way it is typed: `099 123 456`, `+598 99 123 456`) and an optional note, checked with the same rules as the order. One submit is one order: the button is off while it is sent and before React owns it, and the same cart and phone sent again carry the same request key, which the server answers with the order it already took (FER-025). Failures say what to do: too many orders (with the minutes to wait), an article that changed (the cart reads its articles again), refused, or try again.
- On success the cart is cleared and the shopper lands on `/{store}/orders/{token}` (`organisms/store-order`): "¡Recibimos tu pedido!", the code, what happens next with the phone masked, the status, the items and total, the note, and "Escribirle a la tienda" on WhatsApp when the store has a number. Per request (the status changes), `noindex`, a 404 for a token of another store or a malformed one.
- Bots: `order.create` asks Vercel BotID first and refuses a bot before any read; on Vercel only, where the check works (`docs/agents/security.md` § Rate limits).
- Phone verification (FER-028) is not built: the order page shows only the confirmation.
- E2E (`src/e2e/tests/store/checkout.e2e.ts`): two articles, a quantity changed, the order placed and its page checked; a double tap makes one order and the cart is empty after it; a sold-out article blocks the order until removed; the English copy.
- **Pending:** "the order appears in the store's admin" is FER-027's screen; here the order is in the database the moment it is placed (checked by the e2e), with no step by the shopper. "On a phone with one hand" is by design (every control full width or 44 px or more, the submit at the bottom), checked at 375 px, not on a device.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
