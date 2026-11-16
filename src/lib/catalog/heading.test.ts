import { describe, expect, test } from "vitest";

import { selectionName } from "./heading";
import { type CatalogQuery, EMPTY_CATALOG_QUERY } from "./query";

function makeQuery(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, ...overrides };
}

const CATEGORIES = [
  { name: "Anillos", slug: "anillos" },
  { name: "Aros", slug: "aros" },
];
const FILTERS = [
  {
    name: "Color",
    slug: "color",
    values: [
      { name: "Dorado", slug: "dorado" },
      { name: "Plateado", slug: "plateado" },
    ],
  },
  { name: "Talle", slug: "talle", values: [{ name: "M", slug: "m" }] },
];

describe("selectionName", () => {
  test.each([
    ["nothing chosen", {}, null],
    ["only a sort", { sort: "price_asc" as const }, null],
    ["a category", { category: "aros" }, "Aros"],
    ["a search, in «»", { q: "corona" }, "«corona»"],
    [
      "a filter's values, joined in the address's order",
      { filters: [{ attribute: "color", values: ["plateado", "dorado"] }] },
      "Plateado, Dorado",
    ],
    [
      "everything, category first and the search last",
      {
        category: "anillos",
        filters: [
          { attribute: "color", values: ["dorado"] },
          { attribute: "talle", values: ["m"] },
        ],
        q: "oro",
      },
      "Anillos · Dorado · M · «oro»",
    ],
    [
      "names the store does not have, left out",
      {
        category: "pulseras",
        filters: [
          { attribute: "color", values: ["morado", "dorado"] },
          { attribute: "marca", values: ["acme"] },
          { attribute: "talle", values: ["dorado"] },
        ],
      },
      "Dorado",
    ],
    [
      "only unknown names",
      {
        category: "pulseras",
        filters: [{ attribute: "marca", values: ["acme"] }],
      },
      null,
    ],
  ])("names %s", (_case, overrides, expected) => {
    expect(
      selectionName(makeQuery(overrides), CATEGORIES, FILTERS, "«{q}»")
    ).toBe(expected);
  });
});
