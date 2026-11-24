# FER-081 An empty category's breadcrumb does not link to an unlisted group

- **Milestone:** M4 Storefront and orders
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-079

## Goal

A category the storefront does not list (FER-079: no published article) is linked from nowhere a shopper navigates. One link is left: the breadcrumb of an empty category inside a group that is itself unlisted.

## The problem

Found on 2026-11-24 by CodeRabbit on the pull request of FER-079 (#86), outside the diff. `loadCatalogPage` (`src/app/[locale]/(store)/catalog-page.tsx`) adds the group's step to the trail with its address whenever the category has a group, and `getCategoryPage` answers that group without saying whether the storefront lists it. A group is unlisted only while neither it nor any of its categories holds a published article, so the page that shows this trail is an empty category's own, reached only by typing its address and already `noindex, follow`. Nobody is sent there; the link only contradicts "linked from nowhere".

## Scope

- `getCategoryPage`: say whether the group is listed (the rule is `categoriesWithArticles`).
- `molecules/store-breadcrumb`: a step with no address that is not the page itself (today a step without `href` is drawn as `aria-current="page"`).
- The catalog page: keep the group's name in the trail, without its link while the group is unlisted; the `BreadcrumbList` structured data follows.

## Acceptance criteria

- On an empty category of a group with nothing published, the trail names the group as text; once an article of the group is published, it is a link again.
- Only the last step is `aria-current="page"`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
