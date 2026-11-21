# FER-074 The store's home is called "Home" in every language

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-060

## Goal

The store's home has one name: "Home", in Spanish as in English. The admin already says "la home"; the storefront still said "Inicio".

## Decision

2026-11-20, Lucas: the home is called "Home" in every language, never "Inicio". Spanish keeps its grammar around the word ("la home", "Volver a la home de la tienda").

## Scope

- Spanish interface text (`src/content/es/`): the breadcrumb's first step (its house icon's name and the JSON-LD `BreadcrumbList` item) on the catalog, page and article views, the logo's name in the header, footer and phone menu, the not-found page's way back, the error page's link, and the two admin hints that point to the home (categories, settings texts).
- The unit and E2E tests that read those words, and `design.md`, which quotes them.

## Acceptance criteria

- No Spanish interface text calls the store's home "Inicio": `grep -ri inicio src/content/es` finds nothing.
- The breadcrumb reads "Home › Catálogo › …" in Spanish and English, and the phone menu's logo is named "LR Market, home".

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
