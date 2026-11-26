# FER-030 Metrics dashboard

- **Milestone:** M5 Metrics
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-029, FER-027, FER-040

## Goal

One page tells Lucas how the store is doing and whether the AI feature earns its cost.

## Scope

`/admin/metrics`, with a date range in the URL, in the admin shell and cards of [FER-040](FER-040-admin-redesign.md). One store since [FER-038](FER-038-single-store.md): no store filter, no per-store split.

- **Articles:** most viewed; views over time; articles with many views and no orders; published, draft and unavailable counts.
- **Orders:** count and total amount over time; split by status; undeliverable rate; average order value; top articles by units ordered. Totals and averages are per currency: an order keeps the currency it was placed in, and the store's currency, though fixed per store and not editable from the admin (FER-014), can be changed by hand in the database, so a range may hold pesos and dollars. They are never added together or converted.
- **Funnel:** store visits, article views, orders.
- **Adoption:** articles created per week, time since each login's last sign-in.

## Acceptance criteria

- Every number comes from an aggregate query in a service, tested against a seeded dataset with known answers.
- Charts follow the template's chart colors, work in light and dark, and each has a table view.
- Empty ranges read as "no data" rather than zero-filled charts.
- An anonymous visit ends at sign-in, and each procedure refuses an anonymous call.

## Decisions (Lucas, 2026-11-25)

- **AI usage moves to [FER-018](FER-018-ai-autofill.md):** without the AI feature there is no `ai_generation` row to show; its ticket adds the section.
- **The share of orders with the phone confirmed moves to [FER-028](FER-028-whatsapp-phone-verification.md):** until codes exist it would always read 0%.
- **Charts with Recharts** (3.8.0, pinned), drawn by the project's own `molecules/metrics-chart` rather than shadcn's chart file.
- Defaulted: the range opens on the last 30 days, with 7, 30, 90 days and a year as one tap, and any range up to a year by its address; the rankings list ten articles; a week starts on Monday; a login's last sign-in is its newest session.

## Notes

Load the `dataviz` skill before building charts.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
