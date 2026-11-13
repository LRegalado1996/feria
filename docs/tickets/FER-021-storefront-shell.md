# FER-021 Storefront shell

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-008, FER-005

## Goal

Every public page of a store shares one header, footer and feel.

## Scope

- Header: store logo, links to home and catalog, search entry, locale toggle, cart button with item count. Sticky, with a full-screen menu on mobile.
- Footer: Instagram and TikTok links, a WhatsApp contact link, the store's tagline, a discreet "made by Lucas Regalado" credit linking to the personal site.
- Page transitions and the reveal behaviour from FER-005.
- Store-aware `not-found` and `error` pages.
- Per-store metadata defaults: title template, description, share image, theme color.

## Acceptance criteria

- The shell renders from server components; only the menu, the toggle and the cart count hydrate.
- Social links appear only when the store has them set.
- Lighthouse on mobile for an empty store: performance and accessibility at 95 or above.
- E2E: navigation, mobile menu, locale toggle keeping the store.
