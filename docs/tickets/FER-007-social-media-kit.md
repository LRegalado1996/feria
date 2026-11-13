# FER-007 Instagram and TikTok kit, fair print pieces

- **Milestone:** M1 Brand
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-006

## Goal

Lucas can publish tidy, consistent posts in minutes and has what the stall needs on paper.

## Scope

- Profile pictures and bios for Instagram and TikTok, in Spanish.
- Templates as editable sources plus exported PNGs: feed post 1080×1350, story and TikTok cover 1080×1920, carousel slides, story highlight covers.
- Template set: new article, price drop, "find us at the fair" with dates December 5 to January 5, best sellers, how to order by WhatsApp.
- Print: an A4 sign with a QR code to the store, a small price-tag layout, a QR sticker for bags.
- A first content plan: nine launch posts with captions and hashtags.

## Out of scope

Generating a post image from an article inside the admin. Worth a ticket after launch if the manual templates prove useful.

## Acceptance criteria

- Sources and exports live in `docs/brand/social/`, and `docs/brand/brand.md` explains how to make a new post from a template.
- The QR code resolves to the production URL and is tested on a printed page.

## Notes

The QR must point at the final custom domain, so print after FER-032, or encode a URL that redirects.
