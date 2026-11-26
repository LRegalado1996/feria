# FER-088 A request limit on the public API

- **Milestone:** M6 Launch
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-029

## Goal

No single client can tie up the database through the public API, whatever procedure it calls.

## Scope

- Found in review of FER-029 (PR #109): `metrics.countView` and `metrics.countVisit` cap what one client counts a day, but each request past the cap still runs its transaction. The same holds for every public read (`catalog.list`, `catalog.product`, `catalog.cartProducts`), which run queries with no request limit; only `order.create` (BotID, hourly limits) and sign-in (Better Auth) have one.
- Decide where the limit lives: a Vercel Firewall rate-limit rule on `/api/orpc/*` and `/api/docs/*` (no code, configured by Lucas, written down here and in `docs/agents/security.md`), or an application limit in front of the public procedures, in one shared store (`docs/agents/security.md` § Rate limits: never in-memory per instance for a security limit).
- A request over the limit is answered before any query, with `TOO_MANY_REQUESTS` and its `retryAfter`, and the storefront's own calls stay well under it for a shopper.

## Acceptance criteria

- A burst from one client past the limit is refused before it reaches the database, tested.
- A shopper browsing and buying normally never meets the limit.
- `docs/agents/security.md` § Rate limits says where the limit lives and its numbers.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
