# FER-043 Category groups and a page of their own for each

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-039 (stacked after it)
- **Absorbs:** [FER-042](FER-042-catalog-for-html-only-crawlers.md)

## Goal

A shopper finds the store's articles the way Lucas sells them: everything, then Bijouterie with its chains, rings, earrings and bracelets, then the bubble guns. Each of those is a page of its own with its own address, title, text and cover, which Google and AI assistants read whole, without running a script.

Decided by Lucas on 2026-11-17; the cover was added the same day.

## Scope

- **Header navigation, built from data:** exactly three items for LR Market: "Todos los artículos" / "All articles", "Bijouterie" (a dropdown with Cadenas, Anillos, Aros, Pulseras) and "Burbujeros". The dropdown is a disclosure button with `aria-expanded`: keyboard, Escape, focus back to its button, 44 px targets; before the page's script loads, the group's name is a link to its page. On a phone the menu panel shows the same structure, the group expanding to its categories.
- **Category groups, managed in the admin:** a category may belong to one group, which is another category (a parent), one level only. The admin creates "Bijouterie" and assigns its four categories; Burbujeros has no group. Set in the existing categories screen (`/admin/categories`), in the redesigned admin's style. Schema change approved by Lucas by choosing this option: `pnpm db:generate`, expand then contract.
- **The seed** gives LR Market Bijouterie with those four, and Burbujeros alone, also on a database seeded before this ticket.
- **An address for every page:** all articles at `/productos`, a group at `/bijouterie`, a category at `/bijouterie/anillos`, a category without a group at `/burbujeros`; English under `/en`. Filters stay in the query string (`?color=dorado`). An article's page moves under all articles': `/productos/{slug}` (English `/en/productos/{slug}`, the same slug). The site has never been in production, so no old address exists: nothing redirects from `/products` (Lucas, 2026-11-17).
- **SEO text per page:** each group and category has a title and a description in Spanish and English, editable in the admin. When empty, a text is generated from the category's and the store's names, in both languages, from `src/content`.
- **A cover per page,** after the collection pages of https://landonorris.store: a full-width photo with the page's title over it. Each page can have a computer image and an optional phone image (URL, width and height, so space is reserved) and alt text in Spanish and English; groups and categories hold their own, "all articles" holds its cover on the store row. The phone image below `md`, the computer one above and in its place when there is no phone image (art direction with `next/image`). It is the page's priority image; the title stays the page's `h1`, readable over the photo with the one fade `design.md` allows. Without a cover the page shows its plain title. Until uploads exist (FER-011) the seed sets the covers from the photos in `public/seed/`, and the admin's categories screen previews each cover with a note that uploading comes with FER-011.
- **Every catalog page made for Google and AI crawlers:** the articles and the footer in the HTML for a crawler that runs no script (FER-042); its own `<title>`, description, canonical address and `hreflang`; JSON-LD `CollectionPage`, `ItemList` and `BreadcrumbList`; an entry in the sitemap and in `llms.txt`; a visible breadcrumb (Inicio › Bijouterie › Anillos); the cover as its share card when it has one.

## Out of scope

- Uploading covers: [FER-011](FER-011-image-uploads.md) builds the uploader; this ticket stores and shows covers, the seed sets them.
- An editable text and cover for "all articles" in the admin: the company settings are [FER-014](FER-014-store-management.md).

## Acceptance criteria

- The header shows "Todos los artículos", "Bijouterie" with its four categories in a dropdown, and "Burbujeros", from the database; the phone menu shows the same structure. The dropdown opens and closes with the keyboard, Escape hands focus back to its button, and its targets are 44 px.
- In `/admin/categories` a category can join a group and leave it, a group cannot join another group, and a category's SEO texts can be set in both languages; the covers are previewed with the FER-011 note.
- `/productos`, `/bijouterie`, `/bijouterie/anillos` and `/burbujeros` (and `/en/…`) answer 200 with their articles; an unknown one answers the not-found page (a real 404 for a crawler that runs no script; see Decisions); a category asked for under the wrong group, or without its group, is sent permanently to its address (a 308 for such a crawler).
- An article's page is `/productos/{slug}` (and `/en/productos/{slug}`), and every link, card, row, the cart, the share button, the JSON-LD, the canonical and `hreflang`, the sitemap and `llms.txt` lead there; `/products` is an address like any other the site does not answer.
- As Bingbot with scripts off, a category page shows its articles, its breadcrumb and its footer.
- Each catalog page has its own title, description, canonical and `hreflang`, JSON-LD `CollectionPage`, `ItemList` and `BreadcrumbList`, and is listed in the sitemap and in `llms.txt`.
- A page with a cover shows its image and its `h1` at a phone's width and at a computer's.
- The English path decision is recorded below.

## Decisions

- **The path segment is not translated:** `/en/productos`, `/en/bijouterie/anillos`. `docs/agents/i18n.md` makes the prefix the only difference between the two languages of a page: the proxy only adds or strips `/en`, the language link leads to the same path in the other language, and a category has one slug. Translated paths would need a slug per language, a path map in the proxy and a language link that translates paths; the repo has none of it.

- **An article lives under all articles': `/productos/{slug}`** (Lucas, 2026-11-17), with no redirect from `/products/{slug}`: the site has never been in production, so no old address exists anywhere. No category can be `productos` (`RESERVED_CATEGORY_SLUGS`), so `/productos/{slug}` is always an article.
- **A category's slug is never an address the site already answers** (`RESERVED_CATEGORY_SLUGS`: `cart`, `productos`, `en`, `admin`…): a category named "Cart" gets `/cart-2`.
- **A group may hold articles of its own** (an article moved into it when a category is deleted, say); its page lists them with its categories'. Deleting a group leaves its categories in no group.
- **"Bijouterie" in English is "Jewelry"** in the seed: the name is data, editable in the admin.
- **The catalog pages read per request, before anything is sent** (as the home does since FER-039), rather than as static pages like an article's, so the filters, the search and the sort keep a server-rendered first page with its own title. The cost: a browser waits for the page instead of seeing a shell first; and an unknown address of one or two segments (`/relojes`, `/bijouterie/relojes`) reaches the dynamic catalog route, whose shell Next serves first, so a browser gets the not-found page (`noindex`) with a 200 and a category asked outside its group is redirected in the browser. A crawler that runs no script gets the whole render: a real 404 or 308. `/admin/{unknown}` got a catch-all of its own to keep its real 404.
- **A category choice in the filter panel closes it**: a category is now another page, and the page left behind stays mounted and hidden, so the panel leaves at once, without an exit animation.

## Outcome

- **Data** (migration `0013`, expand only): `category.parentId` (the group, (`storeId`, `parentId`) → (`storeId`, `id`), never itself), the cover's six columns on `category` and, as `catalogCover…`, on `store`; `category_translation.seoTitle`, `seoDescription`, `coverAlt`; `store_translation.catalogCoverAlt`; checks keep each image whole and its texts within their limits.
- **Services and API:** `updateCategoryPage` (group one level deep, decided under the store's category lock, with a two-writer test; English texts need an English name) behind `category.updatePage`; a rename now upserts its names; `listCategories` gives each category's path, `getCategoryPage` and `getAllArticlesCover` (cached with the catalog) read a page; a group's listing holds its categories' articles; the sitemap and `llms.txt` list every group and category page with a published article.
- **Seed:** `seedCatalogPages` gives LR Market Bijouterie (first) with Cadenas, Anillos, Aros and Pulseras, Burbujeros alone, and every cover from `public/seed/`, also on a database seeded before.
- **Storefront:** `/productos`, `/[group]` and `/[group]/[category]` render `(store)/catalog-page.tsx`: the breadcrumb (`molecules/store-breadcrumb`), the cover (`molecules/store-catalog-cover`: `<picture>` art direction, square on a phone, 3:1 on a computer, fetched first), the admin's texts or ones written from `src/content`, canonical and `hreflang`, JSON-LD `CollectionPage` (with its `ItemList`) and `BreadcrumbList`, the cover as share card. The header and the phone menu are built from the data (`molecules/store-nav-group`). An article's page moved to `/productos/{slug}` (`articlePath`). The catalog's skeleton is gone with its boundary.
- **Admin:** each row of `/admin/categories` says its group, and opens its page (`molecules/category-page-form`): group, texts for search engines in both languages, cover preview and its description.
- **E2E:** `tests/store/catalog-pages.e2e.ts` (Bingbot with scripts off on a category page; a group's page, its title, description, canonical, `hreflang` and JSON-LD; the cover and `h1` at 1440 and 390 px; the redirects; the phone menu's group; the header's dropdown by keyboard on `/design`), a group set in `tests/admin/categories.e2e.ts`; the other specs follow the new addresses.
- **Docs:** `docs/project/overview.md`, `docs/project/data-model.md`, `docs/agents/nextjs.md`, `docs/agents/i18n.md`, `design.md`, `src/e2e/AGENTS.md`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
