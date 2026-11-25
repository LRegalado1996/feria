# FER-087 An article's share card answers without a redirect

- **Milestone:** M6 Launch
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-049

## Goal

The image a chat or a social network fetches for an article's link answers at the address the page gives it, in one request.

## The problem

Found on 2026-11-25 while closing FER-083. A Spanish article page names its card as `/es/productos/<slug>/opengraph-image-…/card?…` (`og:image`). The proxy treats that address as a Spanish page with a prefix and answers 308 to the same path without `/es`, where the image then answers 200. The proxy already lets the site's own card through (`/es/opengraph-image`); an article's card is not in that list.

Most crawlers follow the redirect, so the card shows today. One that does not would show the link without its picture, and every fetch costs two requests.

## Scope

- Either the page names the card at the address that answers (no `/es`), or the proxy lets an article's card through as it does the site's.
- An e2e asks for the address in a Spanish article's `og:image` and gets the image, not a redirect.

## Acceptance criteria

- `curl -I` on the `og:image` of a Spanish and an English article page answers 200 with `image/png`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
