# Tickets

One markdown file per ticket, key `FER`. Read [the project overview](../project/overview.md) and [the data model](../project/data-model.md) first.

## How we work

- Take tickets in order unless a dependency says otherwise. One ticket, one branch (`fer-012-short-name`), one PR into `qa`.
- `qa` and `main` accept pull requests only. `main` is production and receives promotion PRs from `qa` once `qa` is stable.
- CodeRabbit reviews each PR into `qa` (not the promotion PR into `main`, whose changes were already reviewed) and the local agent answers it until every thread is settled (the `review-loop` skill). Lucas gives the word to merge.
- A PR with a visible change includes one image of the result in its description (before and after only for a bug fix), or a recording. The `visual-proof` check fails without one.
- Commit messages and PR titles follow Conventional Commits, with the ticket in a `Refs: FER-012` footer. The rules are in the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).
- A ticket is done when its acceptance criteria hold and the template's definition of done passes (`AGENTS.md`).
- Update the `Status` line in the ticket and the table below in the same PR: `todo`, `in progress`, `done`.
- New work found along the way becomes a new ticket with the next free number. Tickets are never renumbered.
- Progress is reported in Slack, one message per event, following the `slack-reporting` skill: `#feria-tickets`, `#feria-prs`, `#feria-deploys`, and `#feria-general` for decisions and the end-of-session summary.
- **P0** is needed for the fair on December 5. **P1** should make it. **P2** can follow the launch.

## Index

### M0 Foundation

| ID                                            | Title                                          | Priority | Status |
| --------------------------------------------- | ---------------------------------------------- | -------- | ------ |
| [FER-001](FER-001-bootstrap-from-template.md) | Bootstrap the repo from the template           | P0       | done   |
| [FER-002](FER-002-vercel-neon-blob.md)        | Vercel project, Neon database and Blob storage | P0       | done   |
| [FER-003](FER-003-ci-and-previews.md)         | CI, preview deployments and error reporting    | P0       | todo   |
| [FER-004](FER-004-i18n-foundation.md)         | Spanish and English with a toggle              | P0       | todo   |
| [FER-005](FER-005-design-system.md)           | Storefront design system                       | P0       | todo   |
| [FER-034](FER-034-coming-soon-page.md)        | Coming-soon page on production                 | P0       | todo   |

### M1 Brand

| ID                                     | Title                                       | Priority | Status |
| -------------------------------------- | ------------------------------------------- | -------- | ------ |
| [FER-006](FER-006-brand-identity.md)   | Name, logo and brand identity               | P0       | todo   |
| [FER-007](FER-007-social-media-kit.md) | Instagram and TikTok kit, fair print pieces | P1       | todo   |

### M2 Core domain

| ID                                             | Title                                              | Priority | Status |
| ---------------------------------------------- | -------------------------------------------------- | -------- | ------ |
| [FER-008](FER-008-store-domain-and-theming.md) | Store domain, routing by path and theming          | P0       | todo   |
| [FER-009](FER-009-roles-and-access.md)         | Roles, memberships and closed sign-up              | P0       | todo   |
| [FER-010](FER-010-catalog-domain.md)           | Catalog domain: categories, articles, translations | P0       | todo   |
| [FER-011](FER-011-image-uploads.md)            | Image upload pipeline                              | P0       | todo   |
| [FER-012](FER-012-remove-post-demo.md)         | Remove the posts demo                              | P1       | todo   |
| [FER-033](FER-033-article-filters.md)          | Article filters: color and other attributes        | P0       | todo   |

### M3 Admin

| ID                                        | Title                                        | Priority | Status |
| ----------------------------------------- | -------------------------------------------- | -------- | ------ |
| [FER-013](FER-013-admin-shell.md)         | Admin shell and sign-in                      | P0       | todo   |
| [FER-014](FER-014-store-management.md)    | Store management and company settings        | P0       | todo   |
| [FER-015](FER-015-user-management.md)     | User management                              | P1       | todo   |
| [FER-016](FER-016-category-management.md) | Category management                          | P0       | todo   |
| [FER-017](FER-017-article-wizard.md)      | Article upload wizard                        | P0       | todo   |
| [FER-018](FER-018-ai-autofill.md)         | Fill the article from its photos with Claude | P0       | todo   |
| [FER-019](FER-019-article-list.md)        | Article list and quick edits                 | P0       | todo   |
| [FER-020](FER-020-home-curation.md)       | Home curation: banners, ranking, featured    | P0       | todo   |

### M4 Storefront and orders

| ID                                                | Title                               | Priority | Status |
| ------------------------------------------------- | ----------------------------------- | -------- | ------ |
| [FER-021](FER-021-storefront-shell.md)            | Storefront shell                    | P0       | todo   |
| [FER-022](FER-022-home-view.md)                   | Home view                           | P0       | todo   |
| [FER-023](FER-023-catalog-view.md)                | Catalog view                        | P0       | todo   |
| [FER-024](FER-024-article-view-and-seo.md)        | Article view and SEO                | P0       | todo   |
| [FER-025](FER-025-order-domain.md)                | Order domain                        | P0       | todo   |
| [FER-026](FER-026-cart-and-checkout.md)           | Cart and checkout                   | P0       | todo   |
| [FER-027](FER-027-order-management.md)            | Order management in the admin       | P0       | todo   |
| [FER-028](FER-028-whatsapp-phone-verification.md) | Phone verification by WhatsApp code | P2       | todo   |

### M5 Metrics

| ID                                      | Title                        | Priority | Status |
| --------------------------------------- | ---------------------------- | -------- | ------ |
| [FER-029](FER-029-view-tracking.md)     | View and visit tracking      | P1       | todo   |
| [FER-030](FER-030-metrics-dashboard.md) | Superadmin metrics dashboard | P1       | todo   |

### M6 Launch

| ID                                                | Title                              | Priority | Status |
| ------------------------------------------------- | ---------------------------------- | -------- | ------ |
| [FER-031](FER-031-launch-content.md)              | Launch content for the fair        | P0       | todo   |
| [FER-032](FER-032-domain-and-launch-checklist.md) | Custom domain and launch checklist | P0       | todo   |

## Dependency sketch

```
001 → 002 → 003
001 → 004 → 005 → 006 → 007
002, 005 → 034
002 → 008 → 009 → 013 → 014, 015
008 → 010 → 011 → 017 → 018
010 → 016, 019, 020
010 → 033 → 017, 023
005, 008 → 021 → 022, 023, 024
010 → 025 → 026 → 027 → 028
024 → 029 → 030
everything P0 → 031 → 032
```
