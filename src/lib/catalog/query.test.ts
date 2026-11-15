import { describe, expect, test } from "vitest";

import {
  type CatalogQuery,
  catalogHref,
  clearFilters,
  EMPTY_CATALOG_QUERY,
  isFiltered,
  knownOnly,
  readCatalogQuery,
  toggleFilterValue,
} from "./query";

function makeQuery(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, ...overrides };
}

/** `count` filters `filtro-0`… with one value each, as a query string has them. */
function manyFilters(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `filtro-${String(index)}`,
      "valor",
    ])
  );
}

describe("readCatalogQuery", () => {
  test("reads the catalog's own parameters and every slug-shaped filter", () => {
    expect(
      readCatalogQuery({
        category: "anillos",
        color: "dorado,plateado",
        q: "  cadena  ",
        sort: "price_asc",
        talle: "m",
      })
    ).toEqual({
      category: "anillos",
      filters: [
        { attribute: "color", values: ["dorado", "plateado"] },
        { attribute: "talle", values: ["m"] },
      ],
      q: "cadena",
      sort: "price_asc",
    });
  });

  test("reads an empty address as the whole catalog, newest first", () => {
    expect(readCatalogQuery({})).toEqual(EMPTY_CATALOG_QUERY);
    expect(EMPTY_CATALOG_QUERY).toEqual({
      category: null,
      filters: [],
      q: null,
      sort: "newest",
    });
  });

  test.each([
    ["a category with a capital", { category: "Anillos" }],
    ["an empty category", { category: "" }],
    ["a repeated category", { category: ["anillos", "aros"] }],
    ["a category past 80 characters", { category: "a".repeat(81) }],
  ])("drops %s", (_case, raw) => {
    expect(readCatalogQuery(raw).category).toBeNull();
  });

  test("keeps a category of exactly 80 characters", () => {
    expect(readCatalogQuery({ category: "a".repeat(80) }).category).toBe(
      "a".repeat(80)
    );
  });

  test.each([
    ["an unknown sort", { sort: "cheapest" }],
    ["a sort in capitals", { sort: "PRICE_ASC" }],
    ["a repeated sort", { sort: ["price_asc", "price_desc"] }],
  ])("reads %s as the newest first", (_case, raw) => {
    expect(readCatalogQuery(raw).sort).toBe("newest");
  });

  test.each([
    ["blank", "   ", null],
    ["repeated", ["oro", "plata"], null],
    ["100 characters", "x".repeat(100), "x".repeat(100)],
    ["past 100 characters, cut", "x".repeat(101), "x".repeat(100)],
    ["between spaces, trimmed first", ` ${"x".repeat(100)} `, "x".repeat(100)],
  ])("reads a search %s", (_case, q, expected) => {
    expect(readCatalogQuery({ q }).q).toBe(expected);
  });

  test("drops parameters whose names or values are not slugs, keeping the rest", () => {
    expect(
      readCatalogQuery({
        FBCLID: "abc",
        color: "dorado",
        fbclid: "IwAR3xYz_Q",
        talle: "M",
        utm_source: "instagram",
        UTM_SOURCE: "instagram",
      }).filters
    ).toEqual([{ attribute: "color", values: ["dorado"] }]);
  });

  test("reads a tracking parameter that looks like a filter as one, which the store's filters then drop", () => {
    const query = readCatalogQuery({ color: "dorado", fbclid: "abc" });

    // `fbclid` is not one of the catalog's own names, and `abc` is a slug.
    expect(query.filters).toEqual([
      { attribute: "color", values: ["dorado"] },
      { attribute: "fbclid", values: ["abc"] },
    ]);
    expect(
      knownOnly(query, [], [{ slug: "color", values: [{ slug: "dorado" }] }])
        .filters
    ).toEqual([{ attribute: "color", values: ["dorado"] }]);
  });

  test("keeps a filter's slug values only, once each, in the address's order", () => {
    expect(
      readCatalogQuery({ color: "plateado,Dorado,,dorado,plateado,oro rosa" })
        .filters
    ).toEqual([{ attribute: "color", values: ["plateado", "dorado"] }]);
  });

  test.each([
    ["repeated", ["dorado", "plateado"]],
    ["empty", ""],
    ["only commas", ",,"],
    ["absent", undefined],
  ])("drops a filter whose value is %s", (_case, value) => {
    expect(readCatalogQuery({ color: value }).filters).toEqual([]);
  });

  test("never reads the catalog's own names as filters", () => {
    expect(
      readCatalogQuery({
        category: "Bad Slug",
        cursor: "abc",
        q: "oro",
        sort: "price_asc",
      }).filters
    ).toEqual([]);
  });

  test.each([
    [10, 10],
    [11, 10],
  ])("keeps %d filters as %d", (count, kept) => {
    expect(
      readCatalogQuery(manyFilters(count)).filters.map(
        (filter) => filter.attribute
      )
    ).toEqual(
      Array.from({ length: kept }, (_, index) => `filtro-${String(index)}`)
    );
  });

  test("counts only the valid filters toward the 10", () => {
    expect(
      readCatalogQuery({
        Malo: "x",
        vacio: "",
        ...manyFilters(10),
      }).filters.map((filter) => filter.attribute)
    ).toEqual(
      Array.from({ length: 10 }, (_, index) => `filtro-${String(index)}`)
    );
  });

  test.each([
    [20, 20],
    [21, 20],
  ])("keeps %d values of a filter as %d", (count, kept) => {
    const values = Array.from(
      { length: count },
      (_, index) => `v${String(index)}`
    );

    expect(readCatalogQuery({ color: values.join(",") }).filters).toEqual([
      { attribute: "color", values: values.slice(0, kept) },
    ]);
  });
});

describe("catalogHref", () => {
  test("leaves every default out", () => {
    expect(catalogHref("lr-market", "es", makeQuery())).toBe(
      "/lr-market/products"
    );
  });

  test("writes category, filters as given, search, then sort, commas readable", () => {
    expect(
      catalogHref(
        "lr-market",
        "es",
        makeQuery({
          category: "anillos",
          filters: [
            { attribute: "talle", values: ["m"] },
            { attribute: "color", values: ["dorado", "plateado"] },
          ],
          q: "oro rosa",
          sort: "price_desc",
        })
      )
    ).toBe(
      "/lr-market/products?category=anillos&talle=m&color=dorado,plateado&q=oro+rosa&sort=price_desc"
    );
  });

  test("keeps the English prefix and escapes what is not a comma", () => {
    expect(catalogHref("lr-market", "en", makeQuery({ q: "50% & más" }))).toBe(
      "/en/lr-market/products?q=50%25+%26+m%C3%A1s"
    );
  });

  test("gives the same link for a selection read back from it", () => {
    const query = makeQuery({
      category: "aros",
      filters: [{ attribute: "color", values: ["oro-rosa", "blanco"] }],
      q: "corona",
      sort: "price_asc",
    });
    const href = catalogHref("lr-market", "es", query);
    const search = new URLSearchParams(href.split("?")[1]);

    expect(readCatalogQuery(Object.fromEntries(search))).toEqual(query);
  });
});

describe("toggleFilterValue", () => {
  test("adds a new filter at the end", () => {
    const query = makeQuery({
      filters: [{ attribute: "talle", values: ["m"] }],
    });

    expect(toggleFilterValue(query, "color", "dorado").filters).toEqual([
      { attribute: "talle", values: ["m"] },
      { attribute: "color", values: ["dorado"] },
    ]);
  });

  test("adds a value to its filter, leaving the others and the rest of the query", () => {
    const query = makeQuery({
      category: "anillos",
      filters: [
        { attribute: "color", values: ["dorado"] },
        { attribute: "talle", values: ["m"] },
      ],
      sort: "price_asc",
    });

    expect(toggleFilterValue(query, "color", "plateado")).toEqual({
      ...query,
      filters: [
        { attribute: "color", values: ["dorado", "plateado"] },
        { attribute: "talle", values: ["m"] },
      ],
    });
  });

  test("takes a chosen value out", () => {
    const query = makeQuery({
      filters: [{ attribute: "color", values: ["dorado", "plateado"] }],
    });

    expect(toggleFilterValue(query, "color", "dorado").filters).toEqual([
      { attribute: "color", values: ["plateado"] },
    ]);
  });

  test("drops the filter when its last value is taken out", () => {
    const query = makeQuery({
      filters: [
        { attribute: "color", values: ["dorado"] },
        { attribute: "talle", values: ["m"] },
      ],
    });

    expect(toggleFilterValue(query, "color", "dorado").filters).toEqual([
      { attribute: "talle", values: ["m"] },
    ]);
  });
});

describe("isFiltered and clearFilters", () => {
  test.each([
    ["nothing", {}, false],
    ["only a sort", { sort: "price_asc" as const }, false],
    ["a category", { category: "anillos" }, true],
    ["a search", { q: "oro" }, true],
    [
      "a filter",
      { filters: [{ attribute: "color", values: ["dorado"] }] },
      true,
    ],
  ])("a query with %s is filtered: %s", (_case, overrides, filtered) => {
    expect(isFiltered(makeQuery(overrides))).toBe(filtered);
  });

  test("clears every narrowing and keeps the sort", () => {
    expect(
      clearFilters(
        makeQuery({
          category: "anillos",
          filters: [{ attribute: "color", values: ["dorado"] }],
          q: "oro",
          sort: "price_desc",
        })
      )
    ).toEqual(makeQuery({ sort: "price_desc" }));
  });
});

describe("knownOnly", () => {
  const CATEGORIES = [{ slug: "anillos" }, { slug: "aros" }];
  const FILTERS = [
    { slug: "color", values: [{ slug: "dorado" }, { slug: "plateado" }] },
    { slug: "talle", values: [{ slug: "m" }] },
  ];

  test("keeps what the store has", () => {
    const query = makeQuery({
      category: "aros",
      filters: [
        { attribute: "color", values: ["dorado", "plateado"] },
        { attribute: "talle", values: ["m"] },
      ],
      q: "perla",
      sort: "price_desc",
    });

    expect(knownOnly(query, CATEGORIES, FILTERS)).toEqual(query);
  });

  test("puts filters and values in the store's order, whatever the address's", () => {
    const filters = [
      { slug: "color", values: [{ slug: "dorado" }, { slug: "rojo" }] },
      { slug: "talle", values: [{ slug: "s" }, { slug: "m" }] },
    ];

    expect(
      knownOnly(
        makeQuery({
          filters: [
            { attribute: "talle", values: ["m", "s"] },
            { attribute: "color", values: ["rojo", "dorado"] },
          ],
        }),
        CATEGORIES,
        filters
      ).filters
    ).toEqual([
      { attribute: "color", values: ["dorado", "rojo"] },
      { attribute: "talle", values: ["s", "m"] },
    ]);
  });

  test("gives two orders of the same selection the same link", () => {
    const filters = [
      { slug: "color", values: [{ slug: "dorado" }, { slug: "rojo" }] },
      { slug: "talle", values: [{ slug: "m" }] },
    ];
    const link = (raw: Record<string, string>) =>
      catalogHref(
        "lr-market",
        "es",
        knownOnly(readCatalogQuery(raw), CATEGORIES, filters)
      );

    expect(link({ color: "rojo,dorado", talle: "m" })).toBe(
      link({ talle: "m", color: "dorado,rojo" })
    );
    expect(link({ talle: "m", color: "rojo,dorado" })).toBe(
      "/lr-market/products?color=dorado,rojo&talle=m"
    );
  });

  test("drops an unknown category, filter and values, keeping search and sort", () => {
    expect(
      knownOnly(
        makeQuery({
          category: "pulseras",
          filters: [
            { attribute: "color", values: ["morado", "dorado"] },
            // A value of another filter is not this one's.
            { attribute: "talle", values: ["dorado"] },
            { attribute: "marca", values: ["acme"] },
          ],
          q: "oro",
          sort: "price_desc",
        }),
        CATEGORIES,
        FILTERS
      )
    ).toEqual(
      makeQuery({
        category: null,
        filters: [{ attribute: "color", values: ["dorado"] }],
        q: "oro",
        sort: "price_desc",
      })
    );
  });

  test("keeps no category when none was asked", () => {
    expect(knownOnly(makeQuery(), CATEGORIES, FILTERS).category).toBeNull();
  });
});
