# FER-006 Name, logo and brand identity

- **Milestone:** M1 Brand
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-005

## Goal

The store has a name, a logo and a small identity that works on a phone screen, an Instagram post and a printed sign at a street stall.

## Scope

- Name: **LR Market**, picked by Lucas. The Instagram and TikTok handles are assumed free; Lucas confirms them before the profiles are created (FER-007).
- Logo: generic on purpose, because the product mix changes. A monogram or wordmark, not a drawing of a bubble gun. Deliver as SVG: full logo, compact mark, one-color versions on light and dark.
- Palette and type, aligned with FER-005. One accent all year: no festive variant (decided by Lucas on 2026-11-13).
- Favicon, app icons and the default Open Graph image, generated in code so they follow the tokens.
- `docs/brand/brand.md`: logo usage and clear space, colors with hex values, type, tone of voice in Spanish and English, do and don't examples.

## Out of scope

Post templates and print pieces (FER-007).

## Acceptance criteria

- Logo files live in `public/brand/` and render crisply at 24 px and at 1080 px.
- The header, favicon and share card of the deployed site use the new identity.
- Lucas has approved the name and the logo (2026-11-13: the price tag with LR and MARKET).

## Notes

The logo directions were shown as an Artifact and Lucas delivered the final drawing as an SVG; `src/lib/brand/logo.ts` is that drawing.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
