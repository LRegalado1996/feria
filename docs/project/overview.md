# Project overview

Working name: **LR Market** (final name is decided in [FER-006](../tickets/FER-006-brand-identity.md)).

A multi-store, bilingual mini e-commerce. The first store is Lucas Regalado's own: bubble guns and jewelry (chains, rings, earrings, bracelets) sold at a street Christmas fair from **December 5, 2026 to January 5, 2027**, and online afterwards. The same product is later sold to other small businesses, so the article-upload flow and the admin panel double as the sales demo.

## Goals

1. A public storefront per store that looks editorial and fast (Volt visual language).
2. An admin panel where loading an article takes under a minute, with Claude filling in everything from the photos.
3. Orders that land in the store's admin and are tracked through four simple states.
4. A superadmin view with the numbers needed to make business decisions.
5. A brand kit good enough for tidy Instagram and TikTok posts.

## Decisions

| Topic | Decision |
| --- | --- |
| Tech base | `template-qa` (Streaver Template): Next.js 16, oRPC, Better Auth, Drizzle, PostgreSQL, Tailwind 4, shadcn. All its guardrails stay: 100% coverage, e2e per user-facing change, CI, ratchets. |
| Visual base | The Volt system from `this-is-pepe` (in the spirit of landonorris.com): giant condensed display type, calm neutrals, one loud accent, engineered motion. We reuse the language, not that site's assets. |
| Hosting | Vercel. Auto-generated URL first; `tienda.lucasregalado.com` or `shop.lucasregalado.com` the week of November 16. |
| Environments | Two. `main` is production and shows a coming-soon page until launch. `qa` is where everything is tried until it is stable; it has its own URL and its own database. |
| Branch flow | Work branch, then a PR into `qa`, then a promotion PR from `qa` into `main`. Both branches are protected: no direct pushes, pull requests only, for admins too. A PR with a visible change must carry an image; the `visual-proof` check enforces it. |
| Code review | CodeRabbit reviews every PR; the local agent verifies each comment, fixes or refutes it with evidence, and repeats until the PR is sound. Three rounds at most before Lucas decides. On a 14-day trial, to be re-evaluated. |
| Database | Neon Postgres through the Vercel Marketplace (the template's CI already creates a Neon branch per preview). |
| Images | Vercel Blob with direct client uploads (function bodies are capped at 4.5 MB). |
| AI | Claude through Vercel AI Gateway (AI SDK, structured output from the photos). Every call is logged for the metrics tab. |
| Repo language | English everywhere: code, comments, commits, docs, tickets. |
| Product language | Spanish by default, English behind a toggle. Locale lives in the URL: `/{store}` is Spanish, `/en/{store}` is English. |
| Multi-store | One deployment. A `store` table holds name, slug, contact, socials and theme colors. Stores are reached by path: `/{storeSlug}`. `/` redirects to the default store. |
| Buying | Cart in the browser, no customer accounts. The customer enters name and phone and the order is saved. The store sees incoming orders in the admin's orders section; no WhatsApp message carries the order. |
| Phone verification | The only use of WhatsApp messaging. Optional and feature-flagged. When enabled, the customer gets a code by WhatsApp and a form to enter it. The order exists before the code; the admin sees a "phone confirmed" flag. Never a blocker. |
| Order states | `received`, `packed`, `delivered`, `undeliverable`. |
| Filters | Besides its category, an article carries values from filters the store defines (Color, Material). Any combination is a shareable catalog link, such as `/{store}/products?category=collares&color=dorado`, made to be sent by WhatsApp. |
| Stock | None. An article is available or not. No variants. |
| Currency | Each store works in one currency, chosen in its settings: Uruguayan pesos (`UYU`) or US dollars (`USD`). Amounts are stored as integers in minor units. |
| Commits and PRs | Conventional Commits 1.0.0, as written in the `conventional-commits` skill. |
| Roles | `superadmin` (Lucas: every store, user, article, plus metrics) and `store member` (owner-level access to their own store; a store can have several). Buyers have no account. |
| Tickets | Markdown files in `docs/tickets/`, key `FER`. |

## Public views

| View | Route (Spanish / English) | Contents |
| --- | --- | --- |
| Home | `/{store}` · `/en/{store}` | Promo banners, social links, a slider per category, a curated "best sellers" ranking, a couple of featured articles. |
| Catalog | `/{store}/products` | Grid with category, color and other filters plus search, all in the URL, and a button to share the filtered view. |
| Article | `/{store}/products/{slug}` | Gallery, price, description, add to cart, related articles. |

Supporting flow, not counted as views: cart drawer, checkout form, and the order confirmation page `/{store}/orders/{token}` (which also hosts the code form when verification is on).

## Admin

| Area | Route | Who |
| --- | --- | --- |
| Sign in | `/admin/sign-in` | everyone with a login |
| Articles, categories | `/admin/{store}/products`, `/categories` | store member, superadmin |
| Orders | `/admin/{store}/orders` | store member, superadmin |
| Home curation | `/admin/{store}/home` | store member, superadmin |
| Company and theme | `/admin/{store}/settings` | store member, superadmin |
| Store users | `/admin/{store}/users` | store member, superadmin |
| Stores, all users | `/admin/platform/stores`, `/users` | superadmin |
| Metrics | `/admin/platform/metrics` | superadmin |

## Template rules this project amends

Each amendment is made in the ticket named, in the same PR as the code that needs it.

- **"One product language per app"** (`design.md`) becomes "Spanish default, English toggle" ([FER-004](../tickets/FER-004-i18n-foundation.md)).
- **Design hard rejects and type scale** (`design.md`) are written for a calm back-office app. The admin keeps them. The storefront gets its own section with the Volt language: uppercase display type, fluid sizes, a marquee ([FER-005](../tickets/FER-005-design-system.md)).
- **Raw color literals** stay banned in components. Store colors come from the database and are injected as CSS variables by the store layout ([FER-008](../tickets/FER-008-store-domain-and-theming.md)).
- **Public sign-up** is removed; logins are created by a superadmin or a store member ([FER-009](../tickets/FER-009-roles-and-access.md)).
- **No JSON columns** stays. Translations are `*_translation` tables keyed by entity and locale.

## Confirmed with Lucas (November 13)

1. WhatsApp is used only to confirm the customer's number. Orders reach the store through the admin.
2. The admin panel is bilingual too, with the same toggle.
3. All members of a store have the same permissions.
4. The store chooses its currency, pesos or dollars.
5. Lucas starts the Meta business verification on November 13.

## Still assumed

- `/` redirects to Lucas's store until there is a reason for a platform landing page.
- Peso prices show without cents; dollar prices show cents only when they are not zero.

## Roadmap

Target: usable at the fair on **December 5**. Order of work, with the milestone each ticket belongs to in [the ticket index](../tickets/README.md).

| Week | Dates | Milestones |
| --- | --- | --- |
| 1 | Nov 13 to 20 | M0 Foundation, M1 Brand (identity), M2 Core domain |
| 2 | Nov 21 to 27 | M3 Admin (articles, AI autofill, curation), M4 Storefront (three views) |
| 3 | Nov 28 to Dec 4 | M4 Orders, M6 Launch. M5 Metrics and the WhatsApp code as time allows |
| After launch | Dec 5 onward | Remaining M5, social kit extras, onboarding the second store |

Start the WhatsApp Business paperwork on day one ([FER-028](../tickets/FER-028-whatsapp-phone-verification.md)): Meta's approval is the only item with a waiting time we do not control.
