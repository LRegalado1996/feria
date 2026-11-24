# Tickets

One markdown file per ticket, key `FER`. Read [the project overview](../project/overview.md) and [the data model](../project/data-model.md) first.

## How we work

- Take tickets in order unless a dependency says otherwise. One ticket, one branch (`fer-012-short-name`), one PR into `qa`.
- `qa` and `main` accept pull requests only. `main` is production and receives promotion PRs from `qa` once `qa` is stable.
- CodeRabbit reviews each PR into `qa` that a person or an agent opens (not the promotion PR into `main` or the merge-back from `main`, whose changes were already reviewed, and not Dependabot's) and the local agent answers it until every thread is settled (the `review-loop` skill). Lucas gives the word to merge.
- A PR with a visible change includes one image of the result in its description (before and after only for a bug fix), or a recording when the change is a gesture or a timing. The `visual-proof` check fails when there is no image or recording at all; whether it is the right proof is for the reviewer.
- Commit messages and PR titles follow Conventional Commits, with the ticket in a `Refs: FER-012` footer. The rules are in the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).
- A ticket is done when its acceptance criteria hold and the template's definition of done passes (`AGENTS.md`).
- Update the `Status` line in the ticket and the table below in the same PR: `todo`, `in progress`, `done`.
- New work found along the way becomes a new ticket with the next free number. Tickets are never renumbered.
- Progress is reported in Slack, one message per event, following the `slack-reporting` skill: `#feria-tickets`, `#feria-prs`, `#feria-deploys`, and `#feria-general` for decisions and the end-of-session summary.
- **P0** is needed for the fair on December 5. **P1** should make it. **P2** can follow the launch.

## Index

### M0 Foundation

| ID                                                      | Title                                                            | Priority | Status |
| ------------------------------------------------------- | ---------------------------------------------------------------- | -------- | ------ |
| [FER-001](FER-001-bootstrap-from-template.md)           | Bootstrap the repo from the template                             | P0       | done   |
| [FER-002](FER-002-vercel-neon-blob.md)                  | Vercel project, Neon database and Blob storage                   | P0       | done   |
| [FER-003](FER-003-ci-and-previews.md)                   | CI, preview deployments and error reporting                      | P0       | done   |
| [FER-004](FER-004-i18n-foundation.md)                   | Spanish and English with a toggle                                | P0       | done   |
| [FER-005](FER-005-design-system.md)                     | Storefront design system                                         | P0       | done   |
| [FER-034](FER-034-coming-soon-page.md)                  | Coming-soon page, managed from the admin                         | P0       | done   |
| [FER-036](FER-036-slack-apps.md)                        | GitHub and Vercel apps post to Slack                             | P2       | todo   |
| [FER-046](FER-046-e2e-head-metadata-helper.md)          | Read a page's head in e2e tests without CSS selectors            | P2       | todo   |
| [FER-047](FER-047-integration-tests-setup.md)           | Integration tests take their rows from `setup()`                 | P2       | todo   |
| [FER-072](FER-072-two-writer-helper-surfaces-errors.md) | The two-writer test helper reports the second writer's own error | P2       | todo   |
| [FER-073](FER-073-tests-assert-what-they-claim.md)      | Tests assert what they claim: exact spies, own rows              | P2       | todo   |

### M1 Brand

| ID                                     | Title                                       | Priority | Status |
| -------------------------------------- | ------------------------------------------- | -------- | ------ |
| [FER-006](FER-006-brand-identity.md)   | Name, logo and brand identity               | P0       | done   |
| [FER-007](FER-007-social-media-kit.md) | Instagram and TikTok kit, fair print pieces | P1       | todo   |

### M2 Core domain

| ID                                                 | Title                                              | Priority | Status |
| -------------------------------------------------- | -------------------------------------------------- | -------- | ------ |
| [FER-008](FER-008-store-domain-and-theming.md)     | Store domain, routing by path and theming          | P0       | done   |
| [FER-009](FER-009-roles-and-access.md)             | Roles, memberships and closed sign-up              | P0       | done   |
| [FER-010](FER-010-catalog-domain.md)               | Catalog domain: categories, articles, translations | P0       | done   |
| [FER-011](FER-011-image-uploads.md)                | Image upload pipeline                              | P0       | done   |
| [FER-012](FER-012-remove-post-demo.md)             | Remove the posts demo                              | P1       | done   |
| [FER-033](FER-033-article-filters.md)              | Article filters: color and other attributes        | P0       | done   |
| [FER-038](FER-038-single-store.md)                 | One store, one admin role                          | P0       | done   |
| [FER-041](FER-041-drop-unread-schema.md)           | Drop what nothing reads any more                   | P2       | todo   |
| [FER-048](FER-048-reserved-category-slug-check.md) | The database refuses a category on a reserved path | P2       | todo   |
| [FER-052](FER-052-drop-article-search-texts.md)    | Drop an article's own search texts                 | P2       | todo   |
| [FER-061](FER-061-drop-home-only-placing.md)       | Drop FER-020's home-only placing                   | P2       | todo   |

### M3 Admin

| ID                                                     | Title                                                        | Priority | Status      |
| ------------------------------------------------------ | ------------------------------------------------------------ | -------- | ----------- |
| [FER-013](FER-013-admin-shell.md)                      | Admin shell and sign-in                                      | P0       | done        |
| [FER-035](FER-035-number-input-decimal-separators.md)  | Number input that accepts either decimal separator           | P0       | done        |
| [FER-014](FER-014-store-management.md)                 | Company settings                                             | P0       | done        |
| [FER-015](FER-015-user-management.md)                  | User management                                              | P1       | todo        |
| [FER-016](FER-016-category-management.md)              | Category management                                          | P0       | done        |
| [FER-017](FER-017-article-wizard.md)                   | Article upload wizard                                        | P0       | done        |
| [FER-018](FER-018-ai-autofill.md)                      | Fill the article from its photos with Claude                 | P0       | todo        |
| [FER-019](FER-019-article-list.md)                     | Article list and quick edits                                 | P0       | in progress |
| [FER-020](FER-020-home-curation.md)                    | Home curation: announcement, banners, rows                   | P0       | done        |
| [FER-040](FER-040-admin-redesign.md)                   | Admin redesign                                               | P0       | done        |
| [FER-053](FER-053-bottom-bar-above-ios-keyboard.md)    | The bottom bar stays above the iPhone keyboard               | P1       | done        |
| [FER-054](FER-054-article-save-conflicts.md)           | Saving one article from two tabs                             | P2       | todo        |
| [FER-055](FER-055-photo-grid-swipe.md)                 | Swiping over the wizard's photos scrolls                     | P2       | todo        |
| [FER-056](FER-056-list-search-and-filters-race.md)     | A pending search and "Aplicar" can lose each other           | P2       | todo        |
| [FER-057](FER-057-article-list-review-follow-ups.md)   | Follow-ups from the article list's last review               | P1       | todo        |
| [FER-064](FER-064-admin-main-landmark-once.md)         | The admin has one main landmark after navigating             | P1       | todo        |
| [FER-065](FER-065-place-blocks-by-section-key.md)      | A block's place between rows follows the row, not a number   | P2       | todo        |
| [FER-066](FER-066-page-sequence-limit.md)              | One limit on a page's blocks, on every path that adds one    | P2       | todo        |
| [FER-067](FER-067-banner-photo-cleanup-race.md)        | A banner photo is never deleted while a save starts using it | P2       | todo        |
| [FER-068](FER-068-stale-order-save.md)                 | Saving a page's order from an old screen asks first          | P2       | todo        |
| [FER-071](FER-071-settings-form-follows-newer-read.md) | The store settings form follows a newer read                 | P2       | todo        |

### M4 Storefront and orders

| ID                                                   | Title                                               | Priority | Status      |
| ---------------------------------------------------- | --------------------------------------------------- | -------- | ----------- |
| [FER-021](FER-021-storefront-shell.md)               | Storefront shell                                    | P0       | done        |
| [FER-022](FER-022-home-view.md)                      | Home view                                           | P0       | done        |
| [FER-023](FER-023-catalog-view.md)                   | Catalog view                                        | P0       | done        |
| [FER-024](FER-024-article-view-and-seo.md)           | Article view and SEO                                | P0       | in progress |
| [FER-025](FER-025-order-domain.md)                   | Order domain                                        | P0       | done        |
| [FER-026](FER-026-cart-and-checkout.md)              | Cart and checkout                                   | P0       | in progress |
| [FER-027](FER-027-order-management.md)               | Order management in the admin                       | P0       | done        |
| [FER-028](FER-028-whatsapp-phone-verification.md)    | Phone verification by WhatsApp code                 | P2       | todo        |
| [FER-039](FER-039-storefront-redesign.md)            | Storefront redesign                                 | P0       | done        |
| [FER-042](FER-042-catalog-for-html-only-crawlers.md) | Catalog content for crawlers that run no script     | P1       | superseded  |
| [FER-043](FER-043-category-groups-and-pages.md)      | Category groups and a page of their own for each    | P0       | done        |
| [FER-044](FER-044-catalog-round.md)                  | Catalog round: header, catalog pages, footer        | P0       | done        |
| [FER-045](FER-045-cart-drawer.md)                    | Cart side panel and a gallery that goes round       | P0       | done        |
| [FER-050](FER-050-storefront-round.md)               | Storefront round: menu, grid, footer, confirm       | P0       | done        |
| [FER-051](FER-051-order-stepper-and-admin-round.md)  | Order stepper, the order pages and an admin round   | P0       | done        |
| [FER-049](FER-049-share-card-blob-photos.md)         | An article's share card draws its uploaded photo    | P1       | todo        |
| [FER-058](FER-058-pages-built-from-sections.md)      | Pages built from sections: the home is the first    | P0       | done        |
| [FER-059](FER-059-home-article-spotlight.md)         | An article in the spotlight on the home             | P0       | done        |
| [FER-060](FER-060-pages-from-the-admin.md)           | Pages built from sections, from the admin           | P0       | done        |
| [FER-069](FER-069-unknown-store-address-404.md)      | An unknown store address answers 404                | P1       | todo        |
| [FER-070](FER-070-home-address-307.md)               | The home's own address answers a 307                | P2       | todo        |
| [FER-074](FER-074-home-wording.md)                   | The store's home is called "Home" in every language | P1       | done        |
| [FER-075](FER-075-featured-row-and-cover-title.md)   | A longer "Destacados" row, a smaller cover title    | P1       | in progress |
| [FER-076](FER-076-how-to-buy-block.md)               | "Cómo comprar" as a block of the home               | P1       | in progress |
| [FER-077](FER-077-banners-without-shade.md)          | Banners without the shade: a text shadow instead    | P1       | in progress |
| [FER-079](FER-079-hide-empty-categories.md)          | Empty categories are hidden from the storefront     | P1       | in progress |

### M5 Metrics

| ID                                      | Title                   | Priority | Status |
| --------------------------------------- | ----------------------- | -------- | ------ |
| [FER-029](FER-029-view-tracking.md)     | View and visit tracking | P1       | todo   |
| [FER-030](FER-030-metrics-dashboard.md) | Metrics dashboard       | P1       | todo   |

### M6 Launch

| ID                                                | Title                              | Priority | Status |
| ------------------------------------------------- | ---------------------------------- | -------- | ------ |
| [FER-031](FER-031-launch-content.md)              | Launch content for the fair        | P0       | todo   |
| [FER-032](FER-032-domain-and-launch-checklist.md) | Custom domain and launch checklist | P0       | todo   |

## Dependency sketch

```
001 → 002 → 003 → 036
001 → 004 → 005 → 006 → 007
002, 005 → 034
002 → 008 → 009 → 013 → 037
008 → 010 → 011 → 017 → 018
010 → 016, 033 → 017, 023
004 → 035 → 017
005, 008 → 021 → 023, 024
010 → 025 → 026 → 027 → 028
012, 027 → 038 → 040 → 039
038 → 041
017 → 049, 052, 053, 054, 055
040 → 014, 015, 017, 019, 020, 030
039, 020 → 022
039 → 042 → 043 → 044, 046, 047, 048
011 → 044
024, 026, 039, 044 → 045
044, 045 → 050
027, 043, 011, 050 → 051
024 → 029 → 030
everything P0 → 031 → 032
```
