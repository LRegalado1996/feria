# FER-032 Custom domain and launch checklist

- **Milestone:** M6 Launch
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-031

## Goal

The store is live on its own domain and has been checked the way a stranger with a phone will use it.

## Scope

- Choose `tienda.lucasregalado.com` or `shop.lucasregalado.com` (the Spanish one fits the audience; the other can redirect to it). Add it in Vercel and create the DNS record.
- Update `BETTER_AUTH_URL`, trusted origins, canonical URLs, the sitemap and the share images to the new domain; redirect the Vercel URL to it.
- Submit the sitemap in Google Search Console.
- Checklist, each item ticked in the PR:
  - Full purchase on an iPhone and an Android phone, on mobile data, in both languages.
  - Admin on a phone: load an article with AI, change an order's status.
  - Lighthouse on mobile for home, catalog and article.
  - Keyboard and screen reader pass on the purchase flow.
  - Sentry receiving production errors; health check monitored.
  - Rate limits and BotID active on order creation and sign-in.
  - Database backups and point-in-time restore confirmed in Neon.
  - AI Gateway spend limit set.
  - Seed and test accounts absent from production.
- Generate the final QR code for the print pieces in FER-007.

## Acceptance criteria

- The domain serves the store over HTTPS and the old URL redirects.
- Every checklist item is ticked or has a ticket explaining why not.
- Lucas gives the go-ahead before the link is shared publicly.
