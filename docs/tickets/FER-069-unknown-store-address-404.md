# FER-069 An unknown store address answers 404

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-021, FER-060

## Goal

An address no page, group, category or article answers (a typo, an old link) answers HTTP 404, as FER-021 meant, not 200.

## The problem

Found on 2026-11-20 while checking FER-060 on a local production build: `/no-such-page` and `/en/no-such-page` answer `200 OK` with the store's not-found page and `<meta name="robots" content="noindex">`. The same happens on FER-059's build, so it predates FER-060. The page streams (Cache Components and Partial Prerendering send the static shell first), so by the time the route calls `notFound()` the status line is already sent; Next then draws the not-found page in the stream and marks it `noindex`. Search engines treat it as a soft 404; monitoring and link checkers see a success.

## Scope

- Decide the not-found before anything is sent for the one-segment route (`[group]`) and the article route: the lookup outside any Suspense boundary, or `instant = false` / a route-level dynamic read so the status can still change (check `node_modules/next/dist/docs/` for this Next version's rule), measured against the pages' static shells and Lighthouse.
- The same for a draft page seen by the public.

## Decision

2026-11-25. This Next (16.4) says it outright: with Cache Components the prerendered shell and its headers go out first, a `200`, even with `instant = false`, and "to return a request-time `404`, use Proxy before the page renders" (`node_modules/next/dist/docs/01-app/02-guides/streaming.md`, "The HTTP contract"). The `[group]` routes read the query string (a catalog page's selection) and the session (a draft's preview), so they cannot be static output like an article's. So the proxy answers them:

- It keeps the store's addresses (its categories with their group, its pages with whether each is published and which is the home), read per server like the coming-soon switch and trusted for 5 seconds to let a page through. Any other answer is decided on a read that started after the request arrived, so a page or category made a moment ago is never a 404. A read that fails lets the request through to its route, which answers as before.
- An address that names nothing is rewritten to the catch-all's one prerendered address, a real 404 under the address that was asked for, in its language. A draft is that 404 for the public, and its route for a signed-in admin.
- Lucas, asked while building: the same pass also gives the home's own address its 307 ([FER-070](FER-070-home-address-307.md)) and a category asked outside its group its 308 ([FER-089](FER-089-category-outside-its-group-308.md)).
- Measured on a local production build, before and after: `/no-such-page`, `/en/no-such-page` and `/bijouterie/no-such` went from 200 to 404; `/bijouterie`, `/burbujeros`, `/bijouterie/anillos`, `/regalos`, `/productos/{slug}` stay 200; a real page pays no new read while the proxy's addresses are under 5 seconds old.

## Acceptance criteria

- `curl -I` on an unknown address, in both languages, answers 404; a real page, group, category and article still answer 200.
- E2E asserts the status on both sides.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
