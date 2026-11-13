# FER-028 Phone verification by WhatsApp code

- **Milestone:** M4 Storefront and orders
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-026, FER-027

## Goal

When enabled, the shopper receives a code by WhatsApp after placing the order and confirms their number by entering it. The order never depends on it.

## Part 1: account setup (Lucas, started November 13)

- Create or reuse a Meta Business account and complete business verification.
- Register a phone number for the WhatsApp Business Platform. It cannot be a number already used in the WhatsApp app.
- Submit an authentication message template in Spanish and English and wait for approval.
- Compare sending directly through Meta's Cloud API with a provider such as Twilio on price per message and setup time; record the choice here.

## Part 2: implementation

- A platform feature flag, plus a switch per store. Off means the confirmation page shows only the banner, exactly as before.
- Table `phone_verification`. On order creation, when enabled, generate a six-digit code, store only its hash with a ten-minute expiry, and send it through a provider interface (one real implementation, one fake for tests and local work).
- The confirmation page shows the code form, a resend button with a cooldown, and a clear result.
- A correct code sets `customer_order.phoneVerifiedAt`. The admin's "phone confirmed" flag reads from it.
- Limits: attempts per code, resends per order, sends per phone per day, and a daily spend cap for the platform.
- A failed send is logged and reported; the shopper still sees their order confirmed.

## Acceptance criteria

- With the flag off, no code is generated or sent and no form shows.
- With it on, a wrong, expired or reused code is refused, each with its own test, and the fifth wrong attempt locks the code.
- The order exists and is visible in the admin before any code is entered.
- E2E with the fake provider covers the happy path and the resend.

## Notes

Meta's approval time is outside our control, which is why this is P2 and designed as an addition. If approval lands before December 5, part 2 is about two days of work.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
