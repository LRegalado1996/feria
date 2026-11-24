# FER-079 Categories with no published article are hidden from the storefront

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-043, FER-051

## Goal

A shopper who follows a category and lands on "Todavía no hay artículos" was sent nowhere. A category shows on the storefront only while it has something to show.

## Decision

2026-11-24, Lucas: a category with no active article is not shown anywhere a shopper navigates, nor a group whose categories are all empty. The admin keeps showing every category.

Taken while building, for Lucas to confirm:

- "Has something to show" is the rule the home's rows already follow: at least one **published** article, sold out or not (a sold-out article still shows on its card as "Agotado"). One rule, one function: `categoriesWithArticles` (`src/lib/catalog/navigation.ts`).
- A group shows while it holds a published article itself or one of its categories does; inside a shown group, its empty categories are left out.
- A direct visit to an empty category's address still answers its page with the empty state: no redirect and no 404 (the address comes back as soon as an article is published). That page is `noindex, follow` and nothing links to it.
- A banner that leads to an empty category shows without its link, as one that leads to an unpublished article already does.

## Scope

- `listShownCategories` (`src/server/services/catalog.ts`): what `catalog.categories` and the cached `readCategories` answer, so the header, the phone menu, the footer and the catalog's filter panel follow. `listCategories` (every category) stays for a page's rows and the admin.
- `getCategoryPage`: a group's categories are the ones with a published article; `isShown` says whether the storefront lists the page, and the catalog page marks an unlisted one `noindex, follow`.
- `getPageContent` and the admin's preview (`getPageCuration`): a banner's link to an unlisted category is dropped.
- The sitemap and `llms.txt` already listed only categories with a published article (`listIndexableCategories`, FER-043): unchanged.
- Caching: every article write that reaches the storefront already drops `catalog:<storeId>`, which `readCategories` and `readCategoryPage` carry. Nothing new to invalidate.
- `docs/agents/nextjs.md`, `design.md`.

## Acceptance criteria

- A category with no published article, and a group whose categories all have none, appear in none of: the header, the phone menu, the footer, the catalog's filter panel, the sitemap, `llms.txt`.
- Publishing a category's first article makes it (and its group) appear, and unpublishing its last hides it, on a cached page too (an article's), without a redeploy.
- An empty category's address answers its page with the empty state and `noindex, follow`.
- The admin's categories screen and a page's editor list every category.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
