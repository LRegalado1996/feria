# FER-033 Article filters: color and other attributes

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-010

## Goal

When a customer asks "what do you have in purple?" or "show me the gold necklaces", the store answers with one link sent by WhatsApp that opens the catalog already filtered.

## Scope

- A store defines its own filters (for example Color, Material) and the values of each (gold, silver, purple). An article can carry several values of the same filter: a bracelet can be gold and purple.
- Tables `attribute`, `attribute_translation`, `attribute_value`, `attribute_value_translation`, `product_attribute_value`, as in the data model. A value may carry an optional swatch color, shown as a dot beside its name.
- Services and routers:
  - Public: list a store's filters with their values and the number of published articles under each; the article list from FER-010 accepts any combination of category and values.
  - Store-scoped: create, rename in both languages, reorder and delete filters and values; set an article's values.
- Filter logic: values of the same filter are alternatives (gold or silver); different filters and the category narrow each other (necklaces and gold).
- The filtered view is a plain URL, readable and stable: `/{store}/products?category=collares&color=dorado`. The filter's slug is the parameter name and the value's slug is its value; several values are comma-separated. A filter cannot take a slug the catalog already uses (`category`, `q`, `sort`, `cursor`).
- Admin screen next to categories: one list per filter, add values inline, pick the swatch, see the article count per value. Deleting a value in use asks for confirmation and removes it from those articles.
- Seed for Lucas's store: a Color filter with the common jewelry colors.

## Out of scope

Price ranges and numeric filters. Variants with their own price or stock.

## Acceptance criteria

- `?color=violeta` lists every published purple article of the store across categories; adding `category=collares` narrows it to necklaces.
- An unknown filter or value in the URL is ignored and the page still renders, so an old link never breaks.
- A value with no published articles is not offered on the storefront.
- Filters and values of store A cannot be read, attached or edited through store B.
- Integration tests cover each combination rule on both sides.

## Notes

The storefront UI and the share button are in FER-023, the picker in the wizard in FER-017, the AI suggestion in FER-018, and the "copy link" for the owner in FER-019.

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
