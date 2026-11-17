# FER-043 Category groups and a page of their own for each

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-039 (stacked after it)
- **Absorbs:** [FER-042](FER-042-catalog-for-html-only-crawlers.md)

## Goal

A shopper finds the store's articles the way Lucas sells them: everything, then Bijouterie with its chains, rings, earrings and bracelets, then the bubble guns. Each of those is a page of its own with its own address, title, text and cover, which Google and AI assistants read whole, without running a script.

Decided by Lucas on 2026-11-17; the cover was added the same day.

## Scope

- **Header navigation, built from data:** exactly three items for LR Market: "Todos los artículos" / "All articles", "Bijouterie" (a dropdown with Cadenas, Anillos, Aros, Pulseras) and "Burbujeros". The dropdown is a disclosure button with `aria-expanded`: keyboard, Escape, focus back to its button, 44 px targets; before the page's script loads, the group's name is a link to its page. On a phone the menu panel shows the same structure, the group expanding to its categories.
- **Category groups, managed in the admin:** a category may belong to one group, which is another category (a parent), one level only. The admin creates "Bijouterie" and assigns its four categories; Burbujeros has no group. Set in the existing categories screen (`/admin/categories`), in the redesigned admin's style. Schema change approved by Lucas by choosing this option: `pnpm db:generate`, expand then contract.
- **The seed** gives LR Market Bijouterie with those four, and Burbujeros alone, also on a database seeded before this ticket.
- **An address for every page:** all articles at `/productos`, a group at `/bijouterie`, a category at `/bijouterie/anillos`, a category without a group at `/burbujeros`; English under `/en`. Filters stay in the query string (`?color=dorado`). The catalog's old addresses (`/products`, `/products?category=anillos&color=dorado`) answer with a permanent redirect to the new ones, their filters kept: shared links exist.
- **SEO text per page:** each group and category has a title and a description in Spanish and English, editable in the admin. When empty, a text is generated from the category's and the store's names, in both languages, from `src/content`.
- **A cover per page,** after the collection pages of https://landonorris.store: a full-width photo with the page's title over it. Each page can have a computer image and an optional phone image (URL, width and height, so space is reserved) and alt text in Spanish and English; groups and categories hold their own, "all articles" holds its cover on the store row. The phone image below `md`, the computer one above and in its place when there is no phone image (art direction with `next/image`). It is the page's priority image; the title stays the page's `h1`, readable over the photo with the one fade `design.md` allows. Without a cover the page shows its plain title. Until uploads exist (FER-011) the seed sets the covers from the photos in `public/seed/`, and the admin's categories screen previews each cover with a note that uploading comes with FER-011.
- **Every catalog page made for Google and AI crawlers:** the articles and the footer in the HTML for a crawler that runs no script (FER-042); its own `<title>`, description, canonical address and `hreflang`; JSON-LD `CollectionPage`, `ItemList` and `BreadcrumbList`; an entry in the sitemap and in `llms.txt`; a visible breadcrumb (Inicio › Bijouterie › Anillos); the cover as its share card when it has one.

## Out of scope

- Uploading covers: [FER-011](FER-011-image-uploads.md) builds the uploader; this ticket stores and shows covers, the seed sets them.
- An article's own address stays `/products/{slug}`; only the catalog moves.
- An editable text and cover for "all articles" in the admin: the company settings are [FER-014](FER-014-store-management.md).

## Acceptance criteria

- The header shows "Todos los artículos", "Bijouterie" with its four categories in a dropdown, and "Burbujeros", from the database; the phone menu shows the same structure. The dropdown opens and closes with the keyboard, Escape hands focus back to its button, and its targets are 44 px.
- In `/admin/categories` a category can join a group and leave it, a group cannot join another group, and a category's SEO texts can be set in both languages; the covers are previewed with the FER-011 note.
- `/productos`, `/bijouterie`, `/bijouterie/anillos` and `/burbujeros` (and `/en/…`) answer 200 with their articles; an unknown one answers a real 404; a category asked for under the wrong group, or without its group, is sent permanently to its address.
- `/products?category=anillos&color=dorado` answers a permanent redirect to `/bijouterie/anillos?color=dorado`, and `/products` to `/productos`.
- As Bingbot with scripts off, a category page shows its articles, its breadcrumb and its footer.
- Each catalog page has its own title, description, canonical and `hreflang`, JSON-LD `CollectionPage`, `ItemList` and `BreadcrumbList`, and is listed in the sitemap and in `llms.txt`.
- A page with a cover shows its image and its `h1` at a phone's width and at a computer's.
- The English path decision is recorded below.

## Decisions

- **The path segment is not translated:** `/en/productos`, `/en/bijouterie/anillos`. `docs/agents/i18n.md` makes the prefix the only difference between the two languages of a page: the proxy only adds or strips `/en`, the language link leads to the same path in the other language, and a category has one slug. Translated paths would need a slug per language, a path map in the proxy and a language link that translates paths; the repo has none of it.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
