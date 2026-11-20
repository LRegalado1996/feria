# FER-031 Launch content for the fair

- **Milestone:** M6 Launch
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-017, FER-018, FER-020, FER-022

## Goal

The production store is full and looks alive on opening day.

## Scope

- Fill in the store's settings in production (FER-014): its real WhatsApp number, Instagram and TikTok links.
- Categories: bubble guns, chains, rings, earrings, bracelets.
- Load every article through the wizard with real photos. This is also the first real test of FER-017 and FER-018; write down every rough edge as a ticket.
- Home curation (FER-020): the announcement bar ("Encontranos en la feria, del 5/12 al 5/1"), two or three banners, including "find us at the fair, December 5 to January 5" with the stall's location, set to expire on January 5; a best sellers ranking; featured articles.
- Review every AI-written text in Spanish, and skim the English.
- Place one real order end to end and take it to delivered.

## Acceptance criteria

- No placeholder text or sample article remains in production.
- Every article has at least two photos, a price and a category, and its main photo is a cut-out that sits cleanly on the grey tile.
- Lucas has walked through the store on his own phone in both languages.

## Notes

Photo tips for the stall: daylight, plain background, one photo of the article in use. Good photos do more for the AI's output than any prompt change.

**The home's content (2026-11-19, decided by Lucas).** With FER-022 the storefront's home shows what `/admin/home` curates. In local development and in QA the seed's demo content fills it (`pnpm db:seed`: three cover banners, two between rows, the rows' order, eight best sellers and four featured, FER-020), so the home can be reviewed there as it will look. Production gets none of it: the real announcement, banners, best sellers and featured articles remain for Lucas to load by hand, so this ticket stays open until he has.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
