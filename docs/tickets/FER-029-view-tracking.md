# FER-029 View and visit tracking

- **Milestone:** M5 Metrics
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-024

## Goal

We know which articles people look at, per store and per day, without slowing the storefront or collecting personal data.

## Scope

- Tables `product_view_daily` and `store_visit_daily`: one row per article (or store) per business day in the store's time zone, incremented by upsert.
- A small public endpoint called from the article page and the storefront shell after the page is shown, so cached pages still count.
- Counting rules: one view per article per browser session, known bots ignored, admin sessions ignored.
- The write happens after the response and never fails the page.
- No cookies beyond session storage, no IP addresses stored. Note it in `docs/agents/security.md`.

## Acceptance criteria

- Reloading an article page ten times counts one view; two different sessions count two.
- A burst of requests to the endpoint is rate limited and cannot inflate a single article past the cap.
- Day boundaries follow Montevideo time, tested on both sides of midnight with a frozen clock.

## Notes

Vercel Analytics stays on for traffic sources and web vitals. This table exists because the dashboard needs per-article numbers joined with our own data.
