# FER-085 Store pages at 95 on Lighthouse mobile

- **Milestone:** M4 Storefront and orders
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-024

## Goal

An article's page, the catalog and the home score 95 or more for performance on Lighthouse's mobile profile, on production, so a shared link opens fast on a phone with a slow connection.

## What is known

Measured for [FER-024](FER-024-article-view-and-seo.md) on 2026-11-25 (Lighthouse 13.6.0, mobile profile with its simulated throttling, median of three runs):

- Production, `/productos/cadena-estrella-tornasol`: performance 85, largest paint 2.9 to 3.8 s, blocking time 210 to 390 ms. Accessibility, best practices and SEO 100.
- Locally, on a production build with a Sentry DSN behind an HTTP/2 front, the article page went from 80 to 91 once Sentry's replay recorder loaded after the page settled and the gallery's photos past the second waited for the page to be idle. With Sentry inert the same page scores 91 to 92.
- What is left is the work of hydrating the page: React and Next's runtime (about 230 KB compressed of the article page's scripts), the Sentry SDK and its tracing (about 80 KB), zod (about 33 KB, for the cart kept in the browser and the search's limits), and every client component of the store's frame (header, menu, search, cart panel), all requested before the first photo paints. Lighthouse's simulation counts every script requested before the largest paint, so less script before it is the lever.
- Loading the cart panel on demand saves about 10 KB only: the query client and the oRPC client are in every page through `organisms/app-providers`.

## Scope

- Measure the three pages on production first: the changes above were deployed after the measurement.
- Ship less script to the store's pages: move work from client components to server components where a component only renders, keep the query and oRPC providers out of store pages that do not read through them, load the cart's validation without zod's whole classic API, and weigh client tracing on the store (a privacy and observability call for Lucas, not a tweak).
- Record the scores per page in this ticket.

## Acceptance criteria

- Performance 95 or more on mobile for an article, the catalog and the home, on production, median of three runs; accessibility, best practices and SEO stay at 100.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
