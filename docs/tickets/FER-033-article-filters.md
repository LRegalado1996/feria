# FER-033 Article filters: color and other attributes

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** done
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

## Outcome

- Tables `attribute`, `attribute_translation`, `attribute_value` (an optional `#rrggbb` swatch), `attribute_value_translation` and `product_attribute_value` (migration `0008`). A filter's slug is its URL parameter, so a database check refuses `category`, `cursor`, `q` and `sort`, and the service skips them (`Category` becomes `category-2`). Slugs come from the Spanish name and never change on a rename, so a shared link keeps working.
- Public: `catalog.filters` lists a store's filters with only the values a published article carries, and how many; `catalog.products` takes `filters: [{ attribute, values }]`. Values of one filter are alternatives, filters and the category narrow each other; an unknown filter or value is ignored, and a filter whose values are all unknown does not narrow at all. The storefront turns `?color=dorado,violeta` into that input in FER-023.
- Store-scoped: the `attribute` router (`list`, `create`, `rename`, `reorder`, `delete`, `createValue`, `updateValue`, `reorderValues`, `deleteValue`) and `product.setAttributeValues`, all through `storeProcedure` with the access re-check inside the write's transaction and a per-store advisory lock. A value or filter of another store answers NOT_FOUND; a name already used beside it, ignoring case and accents, CONFLICT.
- `/admin/{store}/filters` (`organisms/filter-manager`, "Filtros" in the navigation after "Categorías"): one card per filter with its values, add values inline with an optional swatch from the browser's color picker, rename, reorder with the up and down buttons, delete. Each value shows how many articles carry it, drafts included; deleting a value in use says how many articles lose it.
- Seed: Lucas's store gets a Color filter with dorado, plateado, oro rosa, negro, blanco, violeta, rojo, verde and azul, each with its swatch, on the sample articles.
- Tests: integration over a real database for every combination rule on both sides and the store isolation (`src/server/services/attribute.integration.test.ts`); e2e in `src/e2e/tests/admin/filters.e2e.ts` (add a filter and a value with its swatch, delete a value in use, reorder kept after a reload, another store's page not found).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
