# FER-025 Order domain

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
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

## Outcome

- Tables `customer_order`, `order_item`, `order_status_event` (migration `0009`). An order's items keep a copy of each article's title and price; deleting the article only clears `productId`.
- Public `order.create` (`POST /stores/{storeSlug}/orders`): the store's active address, the items as article ids and quantities, name, phone, an optional note, the language and a `requestKey` (a uuid the checkout makes per submit). The server loads every article (published, of that store, locked against an edit until the order is written) and computes every price and the total; a missing, draft or other store's article is NOT_FOUND "Article not found", an unavailable one BAD_REQUEST "Article not available"; a quantity of 0 or over 10, more than 20 articles, one listed twice, or any field the input does not name (a price, a total, a currency, a store id) fail the input schema with BAD_REQUEST: a tampered request is refused, never quietly trimmed. The currency is the store's. The order starts `received`, with a 43-character random `token` and a 5-character `code` from an alphabet without look-alikes, unique per store. The same `requestKey` (a v4 uuid) again answers the order it created, so a double tap writes one; reused with another phone it is CONFLICT, so a reused key never hands out another shopper's link. Each article appears once per order, in the database too. A closed storefront (`STOREFRONT_LAUNCHED`) takes no orders.
- Public `order.getByToken`: code, status, items, total, currency, name, the phone masked (`+598•••••456`), whether it is verified; never the internal id.
- Store-scoped `order.list` (newest first, by status, keyset cursor), `order.get` (full phone, items, history with who changed each status) and `order.changeStatus`: `received → packed`, `packed → delivered | undeliverable`, and one step back (`packed → received`, `delivered → packed`, `undeliverable → packed`). A refused move is CONFLICT; each move appends an `order_status_event` with the member who made it. The order is locked, so two members tapping at once move it one after the other.
- Phones are normalized to international format (`normalizePhone`, `src/lib/utils/phone.ts`): `+` or `00` with 8 to 15 digits, or a Uruguayan mobile in local form (`099 123 456`). Landlines in local form are refused.
- Abuse: 5 orders an hour per phone, 20 per client (a keyed hash of the IP Vercel reports, an IPv6 address by its /64), each serialized by its own lock and timed by the database's clock, with `retryAfter`; caps of 20 articles and 10 units each (`docs/agents/security.md` § Rate limits). BotID on the checkout is FER-026's, as Lucas decided.
- `phoneVerifiedAt` exists and stays null until FER-028.
- Tests: integration over a real database (`src/server/services/order.integration.test.ts`) for creation, every tampering case, the copies surviving an edit and a deletion, the resubmit, both limits, store isolation, every status move allowed and refused, and one submit sent twice at once.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
