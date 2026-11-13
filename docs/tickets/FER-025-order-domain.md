# FER-025 Order domain

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-010

## Goal

The backend can take an order from an anonymous shopper safely and track it through its four states.

## Scope

- Tables `customer_order`, `order_item`, `order_status_event`, with migrations.
- Public `order.create`: takes the store slug, items (article id and quantity), customer name, phone and an optional note. The server loads the articles itself, rejects any that are missing, unpublished, unavailable or from another store, and computes every price and the total. Nothing priced by the client is trusted.
- The order copies the store's currency, so a later currency change never rewrites it.
- The order starts as `received`, with a random `token` for its public page and a short human `code` unique per store.
- Public `order.getByToken`: what the confirmation page needs, never the internal id.
- Store-scoped: list with filters, get one, change status. Each change appends an `order_status_event` with the user who made it.
- Allowed moves: `received` to `packed`, `packed` to `delivered` or `undeliverable`, plus a step back for correcting a mistake.
- Phone numbers normalized to international format; Uruguayan mobile numbers accepted in local form.
- Abuse protection on `order.create`: rate limit per IP and per phone, caps on items and quantities, Vercel BotID on the checkout action.

## Acceptance criteria

- A tampered request (wrong price, another store's article, a draft, quantity zero or huge) is rejected with a typed error, each with its own test.
- An order's items keep their title and price after the article is edited or deleted.
- An order of store A is invisible to a member of store B.
- Integration tests cover creation and every status move, allowed and refused.

## Notes

`phoneVerifiedAt` exists from the start and stays null until FER-028.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
