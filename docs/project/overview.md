# Project overview

Name: **LR Market** ([brand guide](../brand/brand.md)). "Feria" is the repository's name.

A bilingual mini e-commerce for one store, Lucas Regalado's own: bubble guns and jewelry (chains, rings, earrings, bracelets) sold at a street Christmas fair from **December 5, 2026 to January 5, 2027**, and online afterwards. The same project is later taken to other small businesses, each as its own deployment with its own company row and theme file, so the article-upload flow and the admin panel double as the sales demo.

## Goals

1. A public storefront that looks like a brand's own shop (in the manner of landonorris.store) and is fast.
2. An admin panel where loading an article takes under a minute, with Claude filling in everything from the photos.
3. Orders that land in the admin and are tracked through four simple states.
4. A metrics view with the numbers needed to make business decisions.
5. A brand kit good enough for tidy Instagram and TikTok posts.

## Decisions

| Topic              | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tech base          | `template-qa` (Streaver Template): Next.js 16, oRPC, Better Auth, Drizzle, PostgreSQL, Tailwind 4, shadcn. All its guardrails stay: 100% coverage, e2e per user-facing change, CI, ratchets.                                                                                                                                                                                                                                                                                                                |
| Visual base        | The storefront follows https://landonorris.store ([FER-039](../tickets/FER-039-storefront-redesign.md), decided 2026-11-16): lime announcement bar, dark header with the logo centered, white page, articles on grey tiles, wide heavy headings. The dark is this-is-pepe's moss; the accent is LR Market's lime. We reuse the structure and feel, never that site's assets. The admin follows Vercel's dashboard ([FER-040](../tickets/FER-040-admin-redesign.md)).                                        |
| Hosting            | Vercel. Production's domain is `market.lucasregalado.com` (the Vercel-generated `feria-blond.vercel.app` stays as the project's own address); the site's origin comes from `BETTER_AUTH_URL`, never from the code.                                                                                                                                                                                                                                                                                          |
| Environments       | Two. `main` is production and shows a coming-soon page until an admin takes it down from the admin (FER-034). `qa` is where everything is tried until it is stable; it has its own URL and its own database.                                                                                                                                                                                                                                                                                                |
| Branch flow        | Work branch, then a PR into `qa`, then a promotion PR from `qa` into `main`. Both branches are protected: no direct pushes, pull requests only, for admins too. A PR with a visible change must carry an image; the `visual-proof` check enforces it.                                                                                                                                                                                                                                                       |
| Code review        | CodeRabbit reviews every PR into `qa` that a person or an agent opens; promotions, merge-backs and Dependabot's PRs are not reviewed. The local agent verifies each comment, fixes or refutes it with evidence, and repeats until the PR is sound. Three rounds at most before Lucas decides. On a 14-day trial, to be re-evaluated.                                                                                                                                                                        |
| Database           | Neon Postgres through the Vercel Marketplace (the template's CI already creates a Neon branch per preview).                                                                                                                                                                                                                                                                                                                                                                                                 |
| Images             | Vercel Blob with direct client uploads (function bodies are capped at 4.5 MB).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AI                 | Claude through Vercel AI Gateway (AI SDK, structured output from the photos). Every call is logged for the metrics tab.                                                                                                                                                                                                                                                                                                                                                                                     |
| Repo language      | English everywhere: code, comments, commits, docs, tickets.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Product language   | Spanish by default, English behind a toggle. Locale lives in the URL: `/` is Spanish, `/en` is English.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Multi-store        | None, decided 2026-11-16 ([FER-038](../tickets/FER-038-single-store.md)). One deployment is one store. A `store` table with exactly one row holds the company's name, contact, socials and currency, so another company is a new deployment with its own row. Colors and logo are code: one theme file. No store in any address.                                                                                                                                                                            |
| Buying             | Cart in the browser, no customer accounts. The customer enters name and phone and the order is saved. The store sees incoming orders in the admin's orders section; no WhatsApp message carries the order.                                                                                                                                                                                                                                                                                                  |
| Phone verification | The only use of WhatsApp messaging. Optional and feature-flagged. When enabled, the customer gets a code by WhatsApp and a form to enter it. The order exists before the code; the admin sees a "phone confirmed" flag. Never a blocker.                                                                                                                                                                                                                                                                    |
| Order states       | `received`, `packed`, `delivered`, `undeliverable`.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Category groups    | A category may belong to one group, another category of the store, one level only ([FER-043](../tickets/FER-043-category-groups-and-pages.md), decided 2026-11-17): LR Market's Bijouterie holds Cadenas, Anillos, Aros and Pulseras; Burbujeros is in none. The header lists the catalog ("Catálogo"), then each group (one control, a dropdown of its categories) and each category in no group, in their positions' order: Burbujeros, then Bijouterie ([FER-044](../tickets/FER-044-catalog-round.md)). |
| Filters            | Besides its category, an article carries values from filters the store defines (Color, Material). Any combination is a shareable catalog link, such as `/bijouterie/anillos?color=dorado`, made to be sent by WhatsApp.                                                                                                                                                                                                                                                                                     |
| Stock              | None. An article is available or not. No variants.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Currency           | The store works in one currency: Uruguayan pesos (`UYU`) or US dollars (`USD`). It is fixed per store and not editable from the admin; changing it is a manual database change (decided 2026-11-18, [FER-014](../tickets/FER-014-store-management.md)). Amounts are stored as integers in minor units.                                                                                                                                                                                                      |
| Commits and PRs    | Conventional Commits 1.0.0, as written in the `conventional-commits` skill.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Roles              | One, `admin`: every login reaches the whole admin (decided 2026-11-16). `user.role` stays for roles that may come later. Buyers have no account.                                                                                                                                                                                                                                                                                                                                                            |
| Tickets            | Markdown files in `docs/tickets/`, key `FER`.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Reporting          | Lucas's Slack workspace, four channels: `#feria-general`, `#feria-tickets`, `#feria-prs`, `#feria-deploys`. Rules and formats are in the `slack-reporting` skill.                                                                                                                                                                                                                                                                                                                                           |

## Public views

| View         | Route (Spanish / English)                        | Contents                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home         | `/` · `/en`                                      | Announcement bar, a cover of banners that moves on its own, then rows of articles (categories, best sellers, featured) and banners.                                                                        |
| All articles | `/productos` · `/en/productos`                   | A full-bleed cover, the trail, the grid with a filter panel (categories, color and other filters), sort (the store's own order by default, FER-044) and search in the query string, loading as it scrolls. |
| Group        | `/bijouterie` · `/en/bijouterie`                 | The same catalog, every article of the group's categories, with the group's own title, texts and cover.                                                                                                    |
| Category     | `/bijouterie/anillos`, `/burbujeros` · `/en/...` | The same catalog, the category's articles; under its group's address when it has one.                                                                                                                      |
| Article      | `/productos/{slug}` · `/en/productos/{slug}`     | A gallery that goes round, price, description, add to cart (which opens the cart panel), related articles.                                                                                                 |

Every catalog page (FER-043) has its own address, title, description, canonical and `hreflang`, a visible breadcrumb, JSON-LD (`CollectionPage`, `ItemList`, `BreadcrumbList`), a sitemap and `llms.txt` entry, and an optional cover. The path segment is Spanish in both languages: the URL's `/en` prefix is the only difference between a page's two languages (`docs/agents/i18n.md`). An article lives under all articles' address, which no category can take.

Supporting flow, not counted as views: the cart, a side panel that adding an article or the header's cart opens on any store page ([FER-045](../tickets/FER-045-cart-drawer.md)); the checkout page `/cart` · `/en/cart` ("Hacer el pedido" in the panel leads there, and the header's cart links there before the page's script runs): the order's summary and the form, whose submit opens a dialog that sums the order up and asks before it is sent ([FER-050](../tickets/FER-050-storefront-round.md)); and the order confirmation page `/orders/{token}` (which also hosts the code form when verification is on).

## Admin

Every signed-in login is an admin and reaches all of it.

| Area                 | Route                                  |
| -------------------- | -------------------------------------- |
| Sign in              | `/admin/sign-in`                       |
| Orders               | `/admin/orders` (`/admin` opens here)  |
| Articles, categories | `/admin/products`, `/admin/categories` |
| Filters              | `/admin/filters`                       |
| Home curation        | `/admin/home`                          |
| Company settings     | `/admin/settings`                      |
| Users                | `/admin/users`                         |
| Metrics              | `/admin/metrics`                       |

## Template rules this project amends

Each amendment is made in the ticket named, in the same PR as the code that needs it.

- **"One product language per app"** (`design.md`) becomes "Spanish default, English toggle" ([FER-004](../tickets/FER-004-i18n-foundation.md)).
- **Design hard rejects and type scale** (`design.md`) are written for a calm back-office app. The admin keeps them. The storefront gets its own section: wide uppercase display type, fluid sizes, pill buttons, carousels and a cover that moves on its own ([FER-005](../tickets/FER-005-design-system.md), [FER-039](../tickets/FER-039-storefront-redesign.md)).
- **Raw color literals** stay banned in components. The store's colors are named variables in one theme file ([FER-038](../tickets/FER-038-single-store.md)).
- **Public sign-up** is removed; logins are created by an admin ([FER-009](../tickets/FER-009-roles-and-access.md)).
- **No JSON columns** stays. Translations are `*_translation` tables keyed by entity and locale.

## Confirmed with Lucas (November 13)

1. WhatsApp is used only to confirm the customer's number. Orders reach the store through the admin.
2. The admin panel is bilingual too, with the same toggle.
3. All members of a store have the same permissions (since 2026-11-16: every login is an admin).
4. The store works in pesos or dollars. Since 2026-11-18 the currency is fixed per store: the admin shows it and never changes it (FER-014).
5. Lucas starts the Meta business verification on November 13.

## Still assumed

- A price shows cents only when it has any, in either currency, and is never rounded on screen. Spanish shows the local symbol (`$ 1.290`, `US$ 12,50`); English shows the ISO code (`UYU 1,290`, `USD 12.50`), because a bare `$` does not tell a visitor from abroad pesos from dollars.

## Roadmap

Target: usable at the fair on **December 5**. Order of work, with the milestone each ticket belongs to in [the ticket index](../tickets/README.md).

| Week         | Dates           | Milestones                                                              |
| ------------ | --------------- | ----------------------------------------------------------------------- |
| 1            | Nov 13 to 20    | M0 Foundation, M1 Brand (identity), M2 Core domain                      |
| 2            | Nov 21 to 27    | M3 Admin (articles, AI autofill, curation), M4 Storefront (three views) |
| 3            | Nov 28 to Dec 4 | M4 Orders, M6 Launch. M5 Metrics and the WhatsApp code as time allows   |
| After launch | Dec 5 onward    | Remaining M5, social kit extras                                         |

Start the WhatsApp Business paperwork on day one ([FER-028](../tickets/FER-028-whatsapp-phone-verification.md)): Meta's approval is the only item with a waiting time we do not control.
