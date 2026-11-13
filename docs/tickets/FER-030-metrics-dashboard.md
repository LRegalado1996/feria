# FER-030 Superadmin metrics dashboard

- **Milestone:** M5 Metrics
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-029, FER-018, FER-027

## Goal

One page tells Lucas how each store is doing and whether the AI feature earns its cost.

## Scope

`/admin/platform/metrics`, superadmin only, with a date range and a store filter in the URL.

- **Articles:** most viewed per store; views over time; articles with many views and no orders; published, draft and unavailable counts.
- **Orders:** count and total amount per store over time; split by status; share with phone confirmed; undeliverable rate; average order value; top articles by units ordered.
- **Funnel:** store visits, article views, orders.
- **AI usage:** generations per store and per user, tokens and cost over time, success rate, share of generated articles that were published, average cost per published article.
- **Adoption:** articles created per store per week, active members, time since last sign-in. These are the signals for which stores are worth a sales follow-up.

## Acceptance criteria

- Every number comes from an aggregate query in a service, tested against a seeded dataset with known answers.
- Charts follow the template's chart colors, work in light and dark, and each has a table view.
- Empty ranges read as "no data" rather than zero-filled charts.
- A member gets 404 on the page and on each procedure.

## Notes

Load the `dataviz` skill before building charts. A per-store version for store owners is a natural follow-up ticket.
