# FER-032 Custom domain and launch checklist

- **Milestone:** M6 Launch
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-031
- **Follow-ups:** FER-082, FER-083

## Goal

The store is live on its own domain and has been checked the way a stranger with a phone will use it.

## Scope

- The domain is `market.lucasregalado.com` (Lucas, 2026-11-24; the earlier candidates were `tienda.` and `shop.lucasregalado.com`). It is added in Vercel, and Production's `BETTER_AUTH_URL` points at it.
- Check on the domain that the trusted origins, canonical URLs, the sitemap and the share images follow `BETTER_AUTH_URL` (they read the origin through `src/lib/seo/origin.ts`; nothing in `src` names a domain); redirect the Vercel URL to it.
- Submit the sitemap in Google Search Console.
- Checklist, each item ticked in the PR (Lucas confirmed on 2026-11-25 that he had done every item but the Sentry check, which the agent ran):
  - [x] Full purchase on an iPhone and an Android phone, on mobile data, in both languages.
  - [x] Admin on a phone: load an article with AI, change an order's status, change the announcement bar.
  - [x] Lighthouse on mobile for home, catalog and article.
  - [x] Lighthouse on mobile for `/coming-soon` on the deployed site, while it is still published and before the launch step below takes it down (FER-034's owed production measurement; once the store opens, a visitor no longer reaches that page).
  - [x] Keyboard and screen reader pass on the purchase flow.
  - [x] Sentry receiving production errors; health check monitored. Sentry project `feria`, environment `production`: 85 error events in the 30 days to 2026-11-25, the latest on 2026-11-24. What they are is [FER-083](FER-083-production-errors-in-sentry.md).
  - [x] Rate limits and BotID active on order creation and sign-in.
  - [x] Database backups and point-in-time restore confirmed in Neon.
  - [x] AI Gateway spend limit set.
  - [x] Seed and test accounts absent from production.
- Launch itself: take the coming-soon page down from the admin (`/admin/settings/coming-soon`, FER-034), which opens the store to the public within seconds; no deploy.
- [x] Generate the final QR code for the print pieces in FER-007.

## Acceptance criteria

- The domain serves the store over HTTPS and the old URL redirects.
- Every checklist item is ticked or has a ticket explaining why not.
- Lucas gives the go-ahead before the link is shared publicly.

## Search engines and the icon

Added on 2026-11-24 with the domain: every search engine and AI assistant should find the store there, once.

- The icons are served at fixed addresses (`/favicon.ico` 48 px, `/icon.png` 96 px, `/apple-icon.png` 180 px), not Next's `icon.tsx`, whose URL carries a hash that changes on every build: Google fetches a favicon on a slow crawl of its own and wants a stable URL, a square whose side is a multiple of 48 px. `/favicon.ico` answered the storefront's HTML before (the proxy rewrote it to `/es/favicon.ico`).
- The home, the catalog without a cover, a store page and the contact page share the brand's card (`og:image`): a page's own `openGraph` replaced the one Next adds by itself.
- Bing: the site `https://market.lucasregalado.com` added in Bing Webmaster Tools and verified (CNAME in Cloudflare; no code), its sitemap submitted. Bing's index feeds ChatGPT search and Copilot.
- Google: the domain property `lucasregalado.com` (verified by DNS) covers the subdomain. Submit the sitemap; request indexing by hand of the home and `/contacto` in both languages, once the stable icon is in production. Lucas asks again once the catalog is loaded.
- IndexNow: its key file is `public/239a2df8583d65e79cf2271b09b4c09c.txt` (outside the proxy). Once it is in production, the home and `/contacto` in both languages are sent to `api.indexnow.org` by hand. Sending on every publish is [FER-082](FER-082-indexnow-on-publish.md).

## Done (2026-11-25)

- Production already declared the domain on 2026-11-25 (Production's `BETTER_AUTH_URL` changed on 2026-11-24, and PR #87's deploy built with it): canonical, `hreflang`, `og:url`, `robots.txt`, all 318 `<loc>` of `sitemap.xml` and every link of `llms.txt`, checked with `curl` on the home, `/en`, a category and an article. Signing in to the admin works on the domain.
- `feria-blond.vercel.app` redirects (308) to the same path and query on the domain, from the project's Domains settings (Lucas's yes, 2026-11-25). QA keeps its own address; the code names neither host.
- Three articles' structured data matches the page: a `Product` with its name, photos, price in UYU and availability.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
