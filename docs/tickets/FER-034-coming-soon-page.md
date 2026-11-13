# FER-034 Coming-soon page on production

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-002, FER-005

## Goal

Until launch, anyone who opens the production URL sees a good-looking "opening soon" page instead of an unfinished store, while `qa` shows the real app.

## Scope

- A launch switch read from the environment (`STOREFRONT_LAUNCHED`), validated in `src/env.js`. Off in production until launch day, on in `qa`, previews and local work.
- While it is off, every public storefront route renders the coming-soon page. The admin, the API and the health check keep working, so the production catalog can be loaded before opening (FER-031).
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

The logo slot uses the wordmark in display type until FER-006 delivers the real logo.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
