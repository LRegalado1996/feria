# FER-070 The home's own address answers a 307

- **Milestone:** M4 Storefront and orders
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-060

## Goal

The address of the page that is the home (`/home`, `/en/home`, or whichever page is chosen) answers an HTTP 307 to `/` (`/en`), so a crawler or a client without script lands on the home.

## The problem

Found on 2026-11-20 on a local production build of FER-060: `/home` answers `200 OK` and the redirect arrives in the stream (`NEXT_REDIRECT;replace;/;307`), carried out by the browser's script. Without script, the visitor stays on a page whose canonical is `/`. The cause is the one in [FER-069](FER-069-unknown-store-address-404.md): `redirect()` runs after the static shell was sent.

## Scope

- Answer the redirect before anything is sent: in `src/proxy.ts` from the cached home address, or in the route before any streamed boundary; keep it temporary (the home can change) and keep the canonical `/`.

## Acceptance criteria

- `curl -I /home` and `/en/home` answer 307 to `/` and `/en`; after choosing another page as the home, its address does and `/home` no longer does.
- E2E with script off.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
