# FER-034 Coming-soon page on production

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-002, FER-005

## Goal

Until launch, anyone who opens the production URL sees a good-looking "opening soon" page instead of an unfinished store, while `qa` shows the real app.

## Scope

- A launch switch read from the environment (`STOREFRONT_LAUNCHED`), validated in `src/env.js`. Off in production until launch day, on in `qa`, previews and local work. Unset, that is the default, so production needs no setting until launch day (`true`).
- While it is off, every public storefront route leads to the coming-soon page with a temporary redirect (307) to `/coming-soon`, so a shared link shows the brand's card (decided by Lucas on 2026-11-14 over answering 503 in place). The admin, the API and the health check keep working, so the production catalog can be loaded before opening (FER-031).
- The page, in the Volt language from FER-005: a giant display headline ("Opening soon" / "Muy pronto"), the fair dates (December 5 to January 5), the store name or logo, Instagram and TikTok links, and a marquee band. One composition that holds from 375 px to wide desktop without a separate mobile design.
- Both languages with the toggle; reduced motion respected.
- Not indexed while the switch is off (`noindex`), with a proper title and share card so a link pasted into WhatsApp already looks like the brand.
- Launch is flipping the variable and redeploying; no code change.

## Acceptance criteria

- With the switch off, `/`, `/{store}` and any article URL show the page and answer with a status that search engines treat as temporary; `/admin` still signs in.
- With it on, the page is unreachable and the storefront renders.
- Lighthouse on mobile: performance and accessibility at 95 or above.
- E2E covers both positions of the switch.

## Notes

The page uses the FER-006 logo. Lucas asked for it to be fun: the headline rises in, the days to the fair count up, and the logo blows a burst of bubbles on load and on every press.

`/admin` is left out of the switch, but no admin page exists until FER-013: until then nobody signs in on production, because today's sign-in form lives at `/`.

Lighthouse was not measured in this ticket: the tool is not a dependency of the repo. Measure it on the first production deployment.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
