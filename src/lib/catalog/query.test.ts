import { describe, expect, test } from "vitest";

import {
  type CatalogQuery,
  catalogHref,
  clearFilters,
  cursorParam,
  EMPTY_CATALOG_QUERY,
  isFiltered,
  knownOnly,
  rawSearchParams,
  readCatalogCursor,
  readCatalogQuery,
  searchOf,
  toggleFilterValue,
} from "./query";

function makeQuery(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, ...overrides };
}

/** A category's page as an address names it (FER-043). */
const RINGS = { path: "/bijouterie/anillos", slug: "anillos" };
const EARRINGS = { path: "/bijouterie/aros", slug: "aros" };

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
  test("takes the page's category from its path and reads every slug-shaped filter", () => {
    expect(
      readCatalogQuery(
        {
          // The old address's parameter names no page any more: dropped.
          category: "aros",
          color: "dorado,plateado",
          q: "  cadena  ",
          sort: "price_asc",
          talle: "m",
        },
        RINGS
      )
    ).toEqual({
      category: RINGS,
      filters: [
        { attribute: "color", values: ["dorado", "plateado"] },
        { attribute: "talle", values: ["m"] },
      ],
      q: "cadena",
      sort: "price_asc",
    });
  });

  test("reads an empty address of all articles as the whole catalog, in the store's order", () => {
    expect(readCatalogQuery({}, null)).toEqual(EMPTY_CATALOG_QUERY);
    expect(EMPTY_CATALOG_QUERY).toEqual({
      category: null,
      filters: [],
      q: null,
      sort: "position",
    });
  });

  test.each([
    ["an unknown sort", { sort: "cheapest" }],
    ["a sort in capitals", { sort: "PRICE_ASC" }],
    ["a repeated sort", { sort: ["price_asc", "price_desc"] }],
  ])("reads %s as the store's order", (_case, raw) => {
    expect(readCatalogQuery(raw, null).sort).toBe("position");
  });

  test.each([
    ["newest", "newest"],
    ["the store's order, asked by name", "position"],
  ] as const)("reads a sort of %s", (_case, sort) => {
    expect(readCatalogQuery({ sort }, null).sort).toBe(sort);
  });

  test.each([
    ["blank", "   ", null],
    ["repeated", ["oro", "plata"], null],
    ["100 characters", "x".repeat(100), "x".repeat(100)],
    ["past 100 characters, cut", "x".repeat(101), "x".repeat(100)],
    ["between spaces, trimmed first", ` ${"x".repeat(100)} `, "x".repeat(100)],
  ])("reads a search %s", (_case, q, expected) => {
    expect(readCatalogQuery({ q }, null).q).toBe(expected);
  });

  test("drops parameters whose names or values are not slugs, keeping the rest", () => {
    expect(
      readCatalogQuery(
        {
          FBCLID: "abc",
          color: "dorado",
          fbclid: "IwAR3xYz_Q",
          talle: "M",
          utm_source: "instagram",
          UTM_SOURCE: "instagram",
        },
        null
      ).filters
    ).toEqual([{ attribute: "color", values: ["dorado"] }]);
  });

  test("reads a tracking parameter that looks like a filter as one, which the store's filters then drop", () => {
    const query = readCatalogQuery({ color: "dorado", fbclid: "abc" }, null);

    // `fbclid` is not one of the catalog's own names, and `abc` is a slug.
    expect(query.filters).toEqual([
      { attribute: "color", values: ["dorado"] },
      { attribute: "fbclid", values: ["abc"] },
    ]);
    expect(
      knownOnly(query, [{ slug: "color", values: [{ slug: "dorado" }] }])
        .filters
    ).toEqual([{ attribute: "color", values: ["dorado"] }]);
  });

  test("keeps a filter's slug values only, once each, in the address's order", () => {
    expect(
      readCatalogQuery(
        { color: "plateado,Dorado,,dorado,plateado,oro rosa" },
        null
      ).filters
    ).toEqual([{ attribute: "color", values: ["plateado", "dorado"] }]);
  });

  test.each([
    ["repeated", ["dorado", "plateado"]],
    ["empty", ""],
    ["only commas", ",,"],
    ["absent", undefined],
  ])("drops a filter whose value is %s", (_case, value) => {
    expect(readCatalogQuery({ color: value }, null).filters).toEqual([]);
  });

  test("never reads the catalog's own names as filters", () => {
    expect(
      readCatalogQuery(
        {
          category: "anillos",
          cursor: "abc",
          q: "oro",
          sort: "price_asc",
        },
        null
      ).filters
    ).toEqual([]);
  });

  // The caps wait for `knownOnly`: until the store's filters are known, a
  // stray parameter cannot be told from a real one.
  test("keeps an 11th filter, for the store's filters to judge", () => {
    expect(
      readCatalogQuery(manyFilters(11), null).filters.map(
        (filter) => filter.attribute
      )
    ).toEqual(
      Array.from({ length: 11 }, (_, index) => `filtro-${String(index)}`)
    );
  });

  test("keeps a 21st value of a filter, for the store's values to judge", () => {
    const values = Array.from(
      { length: 21 },
      (_, index) => `v${String(index)}`
    );

    expect(readCatalogQuery({ color: values.join(",") }, null).filters).toEqual(
      [{ attribute: "color", values }]
    );
  });
});

describe("rawSearchParams and searchOf", () => {
  test("reads a query string as Next hands it, a repeated name as every value", () => {
    expect(
      rawSearchParams(new URLSearchParams("color=dorado,rojo&sort=a&sort=b"))
    ).toEqual({ color: "dorado,rojo", sort: ["a", "b"] });
  });

  test("writes it back as it came, its commas readable", () => {
    expect(
      searchOf({ color: "dorado,rojo", q: "oro rosa", sort: ["a", "b"] })
    ).toBe("color=dorado,rojo&q=oro+rosa&sort=a&sort=b");
  });

  test("writes nothing for no query string and leaves an absent value out", () => {
    expect(searchOf({})).toBe("");
    expect(searchOf({ color: undefined, q: "oro" })).toBe("q=oro");
  });
});

describe("cursorParam and readCatalogCursor", () => {
  test.each([
    ["the store's order", { id: 7, position: 0, sort: "position" }, "0.7"],
    [
      "the store's order with the day it was dealt for (FER-019)",
      { day: "2026-11-25", id: 7, position: 1_073_741_839, sort: "position" },
      "1073741839.7.20261125",
    ],
    [
      "a price order",
      { id: 48, priceAmount: 69_000, sort: "price_desc" },
      "69000.48",
    ],
    [
      "the newest first, its date in milliseconds",
      { id: 3, publishedAt: "2026-11-18T12:30:00.250Z", sort: "newest" },
      "1795005000250.3",
    ],
  ] as const)(
    "writes and reads back a cursor of %s",
    (_case, cursor, param) => {
      expect(cursorParam(cursor)).toBe(param);
      expect(readCatalogCursor({ cursor: param }, cursor.sort)).toEqual(cursor);
    }
  );

  test("reads the key as the address's sort's own", () => {
    expect(readCatalogCursor({ cursor: "120.5" }, "price_asc")).toEqual({
      id: 5,
      priceAmount: 120,
      sort: "price_asc",
    });
    expect(readCatalogCursor({ cursor: "120.5" }, "position")).toEqual({
      id: 5,
      position: 120,
      sort: "position",
    });
  });

  test.each([
    ["none", undefined],
    ["empty", ""],
    ["repeated", ["1.2", "3.4"]],
    ["without its id", "120"],
    ["with a sign", "-1.2"],
    ["with letters", "abc.2"],
    ["with an id of 0", "120.0"],
    ["with an id past the database's integers", "1.2147483648"],
    ["with a key past the database's integers", "2147483648.1"],
    ["a key too long to be one", "1234567890123456.1"],
    ["with a day too short", "120.5.2026112"],
    ["with a thirteenth month", "120.5.20261325"],
    ["with a day 0", "120.5.20261100"],
  ])("reads a cursor %s as the first page", (_case, cursor) => {
    expect(readCatalogCursor({ cursor }, "price_asc")).toBeNull();
  });

  test("a day belongs to the store's order only: on another sort's link it is the first page", () => {
    expect(
      readCatalogCursor({ cursor: "120.5.20261125" }, "price_asc")
    ).toBeNull();
    expect(readCatalogCursor({ cursor: "120.5.20261125" }, "position")).toEqual(
      {
        day: "2026-11-25",
        id: 5,
        position: 120,
        sort: "position",
      }
    );
  });

  test("reads the highest key and id the database holds", () => {
    expect(
      readCatalogCursor({ cursor: "2147483647.2147483647" }, "position")
    ).toEqual({ id: 2_147_483_647, position: 2_147_483_647, sort: "position" });
  });
});

describe("catalogHref", () => {
  test("leaves every default out on the page of all articles", () => {
    expect(catalogHref("es", makeQuery())).toBe("/productos");
    expect(catalogHref("es", makeQuery({ sort: "position" }))).toBe(
      "/productos"
    );
  });

  test("writes the newest first, no longer the default, as a sort", () => {
    expect(catalogHref("es", makeQuery({ sort: "newest" }))).toBe(
      "/productos?sort=newest"
    );
  });

  test("writes a cursor last, its sort's key then the id", () => {
    expect(
      catalogHref("es", makeQuery({ q: "oro", sort: "price_asc" }), {
        id: 48,
        priceAmount: 120_000,
        sort: "price_asc",
      })
    ).toBe("/productos?q=oro&sort=price_asc&cursor=120000.48");
  });

  test("writes the category's page, then filters as given, search and sort, commas readable", () => {
    expect(
      catalogHref(
        "es",
        makeQuery({
          category: RINGS,
          filters: [
            { attribute: "talle", values: ["m"] },
            { attribute: "color", values: ["dorado", "plateado"] },
          ],
          q: "oro rosa",
          sort: "price_desc",
        })
      )
    ).toBe(
      "/bijouterie/anillos?talle=m&color=dorado,plateado&q=oro+rosa&sort=price_desc"
    );
  });

  test("keeps the English prefix on the Spanish path and escapes what is not a comma", () => {
    expect(catalogHref("en", makeQuery({ q: "50% & más" }))).toBe(
      "/en/productos?q=50%25+%26+m%C3%A1s"
    );
    expect(catalogHref("en", makeQuery({ category: RINGS }))).toBe(
      "/en/bijouterie/anillos"
    );
  });

  test("gives the same link for a selection read back from it", () => {
    const query = makeQuery({
      category: EARRINGS,
      filters: [{ attribute: "color", values: ["oro-rosa", "blanco"] }],
      q: "corona",
      sort: "price_asc",
    });
    const href = catalogHref("es", query);
    const search = new URLSearchParams(href.split("?")[1]);

    expect(href.split("?")[0]).toBe("/bijouterie/aros");
    expect(readCatalogQuery(Object.fromEntries(search), EARRINGS)).toEqual(
      query
    );
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
      category: RINGS,
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
    ["a category", { category: RINGS }, true],
    ["a search", { q: "oro" }, true],
    [
      "a filter",
      { filters: [{ attribute: "color", values: ["dorado"] }] },
      true,
    ],
  ])("a query with %s is filtered: %s", (_case, overrides, filtered) => {
    expect(isFiltered(makeQuery(overrides))).toBe(filtered);
  });

  test("clears every narrowing, its category's page too, and keeps the sort", () => {
    expect(
      clearFilters(
        makeQuery({
          category: RINGS,
          filters: [{ attribute: "color", values: ["dorado"] }],
          q: "oro",
          sort: "price_desc",
        })
      )
    ).toEqual(makeQuery({ sort: "price_desc" }));
  });
});

describe("knownOnly", () => {
  const FILTERS = [
    { slug: "color", values: [{ slug: "dorado" }, { slug: "plateado" }] },
    { slug: "talle", values: [{ slug: "m" }] },
  ];

  test("keeps what the store has, the page's category untouched", () => {
    const query = makeQuery({
      category: EARRINGS,
      filters: [
        { attribute: "color", values: ["dorado", "plateado"] },
        { attribute: "talle", values: ["m"] },
      ],
      q: "perla",
      sort: "price_desc",
    });

    expect(knownOnly(query, FILTERS)).toEqual(query);
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
      catalogHref("es", knownOnly(readCatalogQuery(raw, null), filters));

    expect(link({ color: "rojo,dorado", talle: "m" })).toBe(
      link({ talle: "m", color: "dorado,rojo" })
    );
    expect(link({ talle: "m", color: "rojo,dorado" })).toBe(
      "/productos?color=dorado,rojo&talle=m"
    );
  });

  test("drops an unknown filter and values, keeping search and sort", () => {
    expect(
      knownOnly(
        makeQuery({
          filters: [
            { attribute: "color", values: ["morado", "dorado"] },
            // A value of another filter is not this one's.
            { attribute: "talle", values: ["dorado"] },
            { attribute: "marca", values: ["acme"] },
          ],
          q: "oro",
          sort: "price_desc",
        }),
        FILTERS
      )
    ).toEqual(
      makeQuery({
        filters: [{ attribute: "color", values: ["dorado"] }],
        q: "oro",
        sort: "price_desc",
      })
    );
  });

  test("keeps a real filter that ten stray parameters come before", () => {
    expect(
      knownOnly(
        readCatalogQuery({ ...manyFilters(10), color: "dorado" }, null),
        FILTERS
      ).filters
    ).toEqual([{ attribute: "color", values: ["dorado"] }]);
  });

  test("keeps a real value that twenty unknown ones come before", () => {
    const unknown = Array.from(
      { length: 20 },
      (_, index) => `otro-${String(index)}`
    );

    expect(
      knownOnly(
        readCatalogQuery({ color: [...unknown, "plateado"].join(",") }, null),
        FILTERS
      ).filters
    ).toEqual([{ attribute: "color", values: ["plateado"] }]);
  });

  test.each([
    [10, 10],
    [11, 10],
  ])(
    "holds %d of the store's filters to %d, in the store's order",
    (count, kept) => {
      const slugs = Array.from(
        { length: count },
        (_, index) => `filtro-${String(index)}`
      );

      expect(
        knownOnly(
          readCatalogQuery(manyFilters(count), null),
          slugs.map((slug) => ({ slug, values: [{ slug: "valor" }] }))
        ).filters
      ).toEqual(
        slugs.slice(0, kept).map((attribute) => ({
          attribute,
          values: ["valor"],
        }))
      );
    }
  );

  test.each([
    [20, 20],
    [21, 20],
  ])("holds %d of a filter's values to %d", (count, kept) => {
    const values = Array.from(
      { length: count },
      (_, index) => `v${String(index)}`
    );

    expect(
      knownOnly(readCatalogQuery({ color: values.join(",") }, null), [
        { slug: "color", values: values.map((slug) => ({ slug })) },
      ]).filters
    ).toEqual([{ attribute: "color", values: values.slice(0, kept) }]);
  });
});
