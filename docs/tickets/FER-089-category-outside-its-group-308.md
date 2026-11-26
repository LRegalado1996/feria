# FER-089 A category asked outside its group answers 308

- **Milestone:** M4 Storefront and orders
- **Priority:** P2
- **Status:** done
- **Depends on:** FER-043, FER-069

## Goal

A category of a group asked for without its group, under another one or under one it has left (`/anillos`, `/otro/anillos`) answers an HTTP 308 to its page (`/bijouterie/anillos`), its query kept, for a browser too, so a link shared before a move still finds the page without the browser's script.

## The problem

Found on 2026-11-25 while measuring FER-069 on a local production build: `/anillos` answered `200 OK` and the redirect arrived in the stream, carried out by the browser's script; only a crawler that runs no script got the real 308. The cause is FER-069's: `permanentRedirect()` runs after the static shell was sent.

## Decision

2026-11-25, Lucas: in the same pass as FER-069, from the same addresses the proxy keeps. The redirect carries `Cache-Control: private, no-store`, so a browser does not keep it for good: a category that moves back out of its group would otherwise loop.

## Acceptance criteria

- `curl -I /anillos?sort=price_asc` (a category of `bijouterie`) answers 308 to `/bijouterie/anillos?sort=price_asc`, in both languages.
- E2E asserts the status for a browser's request and a crawler's, and that a browser lands on the page through an HTTP redirect.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
