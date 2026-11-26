# FER-070 The home's own address answers a 307

- **Milestone:** M4 Storefront and orders
- **Priority:** P2
- **Status:** done
- **Depends on:** FER-060

## Goal

The address of the page that is the home (`/home`, `/en/home`, or whichever page is chosen) answers an HTTP 307 to `/` (`/en`), so a crawler or a client without script lands on the home.

## The problem

Found on 2026-11-20 on a local production build of FER-060: `/home` answers `200 OK` and the redirect arrives in the stream (`NEXT_REDIRECT;replace;/;307`), carried out by the browser's script. Without script, the visitor stays on a page whose canonical is `/`. The cause is the one in [FER-069](FER-069-unknown-store-address-404.md): `redirect()` runs after the static shell was sent.

## Scope

- Answer the redirect before anything is sent: in `src/proxy.ts` from the cached home address, or in the route before any streamed boundary; keep it temporary (the home can change) and keep the canonical `/`.

## Decision

2026-11-25: done with [FER-069](FER-069-unknown-store-address-404.md), in `src/proxy.ts`, from the store's addresses the proxy keeps (which page is the home), not from a cached read: Next runs no `"use cache"` in the proxy. The redirect drops the query, as the route's did. The old home's address is a page again at once: the addresses the proxy keeps say it leads to `/`, and any answer but "on" is decided again on a read that started after the request. The new home's address can still be let through as an ordinary page for up to 5 seconds (the proxy trusts addresses that old to let a page through, so a page request needs no read), and its route then sends it to `/` from the stream, with a 200; after that window it is a 307. A fresh read on every page request would close the window at the cost of a database read per catalog and page request; that choice is left for another ticket if the window matters.

## Acceptance criteria

- `curl -I /home` and `/en/home` answer 307 to `/` and `/en`; after choosing another page as the home, its address does and `/home` no longer does.
- E2E with script off.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
