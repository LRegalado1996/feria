# FER-069 An unknown store address answers 404

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-021, FER-060

## Goal

An address no page, group, category or article answers (a typo, an old link) answers HTTP 404, as FER-021 meant, not 200.

## The problem

Found on 2026-11-20 while checking FER-060 on a local production build: `/no-such-page` and `/en/no-such-page` answer `200 OK` with the store's not-found page and `<meta name="robots" content="noindex">`. The same happens on FER-059's build, so it predates FER-060. The page streams (Cache Components and Partial Prerendering send the static shell first), so by the time the route calls `notFound()` the status line is already sent; Next then draws the not-found page in the stream and marks it `noindex`. Search engines treat it as a soft 404; monitoring and link checkers see a success.

## Scope

- Decide the not-found before anything is sent for the one-segment route (`[group]`) and the article route: the lookup outside any Suspense boundary, or `instant = false` / a route-level dynamic read so the status can still change (check `node_modules/next/dist/docs/` for this Next version's rule), measured against the pages' static shells and Lighthouse.
- The same for a draft page seen by the public.

## Acceptance criteria

- `curl -I` on an unknown address, in both languages, answers 404; a real page, group, category and article still answer 200.
- E2E asserts the status on both sides.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
