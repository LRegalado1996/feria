# FER-005 Storefront design system

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-004

## Goal

The storefront has its own visual system in the Volt language, documented and built from reusable pieces, while the admin keeps the template's calm back-office style.

## Scope

- Read `this-is-pepe`'s `design-guidelines.mdc`, `motion-guidelines.mdc` and `globals.css`, and adapt them: a display face for headlines, prices and names (always uppercase and tight), a text face for everything else, fluid sizes with `clamp()`.
- Semantic storefront tokens in `src/styles/globals.css`: `store-background`, `store-surface`, `store-foreground`, `store-contrast`, `store-accent`. Defaults are the LR palette from FER-006; FER-008 overrides them per store.
- Storefront components: display heading with line-by-line reveal, eyebrow, chip, reveal on scroll, marquee band, count-up, arrow link, price tag, article card, horizontal slider with snap and keyboard support.
- Motion rules: `transform` and `opacity` only, `prefers-reduced-motion` respected, motion in small client components so text stays in the server HTML.
- Add a "Storefront" section to `design.md` stating where it differs from the admin rules (uppercase display type, fluid sizes, the marquee) and what stays banned (gradients, glows, glass).
- Extend the ratchets so the storefront exceptions are scoped to storefront directories.

## Acceptance criteria

- A hidden `/design` page (non-production only) shows every storefront component in both languages.
- Checked at 375 px and 1280 px, light theme, no horizontal scroll, AA contrast on text.
- Each component has its unit test and follows the atomic design contract.

## Notes

Take the language of landonorris.com, never its material: no logos, photos, copy, fonts files or code from that site. Fonts load through `next/font`.

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
