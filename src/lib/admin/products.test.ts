import { describe, expect, test } from "vitest";

import type { RawSearchParams } from "@/lib/catalog/query";
import {
  CATALOG_FILTER_VALUES_MAX,
  CATALOG_FILTERS_MAX,
  INT4_MAX,
  SEARCH_MAX_LENGTH,
  STORE_PRODUCTS_COUNT_CAP,
} from "@/lib/schemas/catalog";

import {
  EMPTY_PRODUCTS_QUERY,
  FILTER_PARAM_PREFIX,
  isNarrowed,
  newProductPath,
  type ProductsQuery,
  productPath,
  productsListInput,
  productsPath,
  readProductId,
  readProductsQuery,
  readWizardStep,
  sortedBy,
  WIZARD_STEPS,
  withoutFilters,
} from "./products";

describe("WIZARD_STEPS", () => {
  test("goes photos, details, review", () => {
    expect(WIZARD_STEPS).toEqual(["photos", "details", "review"]);
  });
});

describe("readWizardStep", () => {
  test.each([
    ["photos", "photos"],
    ["details", "details"],
    ["review", "review"],
    ["Details", "photos"],
    ["done", "photos"],
    ["", "photos"],
    [null, "photos"],
    [undefined, "photos"],
  ])("reads %j as %s", (value, expected) => {
    expect(readWizardStep(value)).toBe(expected);
  });
});

describe("paths", () => {
  test.each([
    ["es", "/admin/products", "/admin/products/new"],
    ["en", "/en/admin/products", "/en/admin/products/new"],
  ] as const)("in %s, the list and a new article", (locale, list, created) => {
    expect(productsPath(locale)).toBe(list);
    expect(newProductPath(locale)).toBe(created);
  });

  test.each([
    [undefined, "es", "/admin/products/12"],
    ["photos", "es", "/admin/products/12"],
    ["details", "es", "/admin/products/12?step=details"],
    ["review", "en", "/en/admin/products/12?step=review"],
  ] as const)("an article at step %s in %s is %s", (step, locale, expected) => {
    expect(productPath(12, locale, step)).toBe(expected);
  });
});

describe("readProductId", () => {
  test.each([
    ["12", 12],
    [String(INT4_MAX), INT4_MAX],
    [String(INT4_MAX + 1), null],
    ["0", null],
    ["012", null],
    ["new", null],
    ["1e3", null],
  ])("reads %s as %s", (segment, expected) => {
    expect(readProductId(segment)).toBe(expected);
  });
});

/** A list selection: the empty one with `overrides`. */
function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return { ...EMPTY_PRODUCTS_QUERY, ...overrides };
}

/** Slugs `s-0` … `s-(count - 1)`, comma-separated. */
function slugs(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `s-${index}`);
}

describe("readProductsQuery", () => {
  test("an address without a query string is the first page, newest change first, nothing narrowing it", () => {
    expect(readProductsQuery({})).toEqual({
      availability: null,
      categories: [],
      dir: "desc",
      filters: [],
      page: 1,
      q: null,
      sort: "updated",
      status: null,
    });
  });

  test("reads every parameter of a whole selection", () => {
    expect(
      readProductsQuery({
        availability: "unavailable",
        category: "anillos,aros",
        dir: "desc",
        "f.color": "dorado,violeta",
        "f.material": "plata",
        page: "3",
        q: "  collar  ",
        sort: "price",
        status: "draft",
      })
    ).toEqual({
      availability: "unavailable",
      categories: ["anillos", "aros"],
      dir: "desc",
      filters: [
        { attribute: "color", values: ["dorado", "violeta"] },
        { attribute: "material", values: ["plata"] },
      ],
      page: 3,
      q: "collar",
      sort: "price",
      status: "draft",
    });
  });

  test.each([
    ["1", 1],
    ["2", 2],
    [String(STORE_PRODUCTS_COUNT_CAP), STORE_PRODUCTS_COUNT_CAP],
    [String(STORE_PRODUCTS_COUNT_CAP + 1), 1],
    ["0", 1],
    ["-2", 1],
    ["2.5", 1],
    ["dos", 1],
    ["", 1],
    ["123456", 1],
    [["2", "3"], 1],
  ])("reads the page %j as %i", (page, expected) => {
    expect(readProductsQuery({ page }).page).toBe(expected);
  });

  test.each([
    ["title", undefined, "title", "asc"],
    ["title", "desc", "title", "desc"],
    ["updated", undefined, "updated", "desc"],
    ["updated", "asc", "updated", "asc"],
    ["price", "sideways", "price", "asc"],
    ["position", "asc", "updated", "asc"],
    [undefined, undefined, "updated", "desc"],
  ])(
    "reads sort %j and dir %j as %s %s, a column's own first direction when none is named",
    (sort, dir, expectedSort, expectedDir) => {
      const query = readProductsQuery({ dir, sort });

      expect([query.sort, query.dir]).toEqual([expectedSort, expectedDir]);
    }
  );

  test.each<[RawSearchParams, "availability" | "status"]>([
    [{ status: "archived" }, "status"],
    [{ status: ["draft", "published"] }, "status"],
    [{ availability: "yes" }, "availability"],
  ])("drops %j", (raw, field) => {
    expect(readProductsQuery(raw)[field]).toBeNull();
  });

  test.each([
    ["   ", null],
    [`${"a".repeat(SEARCH_MAX_LENGTH)}b`, "a".repeat(SEARCH_MAX_LENGTH)],
  ])("reads the search %j as %j", (q, expected) => {
    expect(readProductsQuery({ q }).q).toBe(expected);
  });

  test("keeps the categories that are slugs, each once, in the address's order", () => {
    expect(
      readProductsQuery({ category: "aros,Anillos,,aros,collares" }).categories
    ).toEqual(["aros", "collares"]);
  });

  test("reads only `f.` parameters as the store's filters, dropping malformed names and values", () => {
    expect(
      readProductsQuery({
        color: "dorado",
        "f.": "x",
        "f.Color": "rojo",
        "f.color": "Dorado,dorado,,dorado",
        "f.talle": ["s", "m"],
        "f.vacio": ",",
      }).filters
    ).toEqual([{ attribute: "color", values: ["dorado"] }]);
    expect(FILTER_PARAM_PREFIX).toBe("f.");
  });

  test("holds the categories, the filters and each filter's values to what the API takes", () => {
    const raw: Record<string, string> = {
      category: slugs(CATALOG_FILTER_VALUES_MAX + 1).join(","),
    };

    for (const name of slugs(CATALOG_FILTERS_MAX + 1)) {
      raw[`f.${name}`] = slugs(CATALOG_FILTER_VALUES_MAX + 1).join(",");
    }

    const query = readProductsQuery(raw);

    expect(query.categories).toEqual(slugs(CATALOG_FILTER_VALUES_MAX));
    expect(query.filters.map((filter) => filter.attribute)).toEqual(
      slugs(CATALOG_FILTERS_MAX)
    );
    expect(query.filters[0]?.values).toEqual(slugs(CATALOG_FILTER_VALUES_MAX));
  });
});

describe("productsPath with a selection", () => {
  test("writes every parameter in a stable order, commas readable", () => {
    expect(
      productsPath(
        "es",
        makeQuery({
          availability: "available",
          categories: ["anillos", "aros"],
          dir: "desc",
          filters: [{ attribute: "color", values: ["dorado", "violeta"] }],
          page: 2,
          q: "collar ñandú",
          sort: "price",
          status: "published",
        })
      )
    ).toBe(
      "/admin/products?q=collar+%C3%B1and%C3%BA&status=published&availability=available&category=anillos,aros&f.color=dorado,violeta&sort=price&dir=desc&page=2"
    );
  });

  test.each([
    ["the defaults", makeQuery(), "/en/admin/products"],
    ["page 1", makeQuery({ page: 1 }), "/en/admin/products"],
    [
      "a column's own first direction",
      makeQuery({ dir: "asc", sort: "title" }),
      "/en/admin/products?sort=title",
    ],
    [
      "the default column turned round",
      makeQuery({ dir: "asc" }),
      "/en/admin/products?dir=asc",
    ],
  ])("leaves out %s", (_case, query, expected) => {
    expect(productsPath("en", query)).toBe(expected);
  });

  test("an address read back is the same selection", () => {
    const query = makeQuery({
      categories: ["aros"],
      filters: [{ attribute: "color", values: ["dorado"] }],
      page: 4,
      q: "aro",
      sort: "category",
      status: "draft",
    });
    const search = new URL(productsPath("es", query), "https://x.test")
      .searchParams;

    expect(readProductsQuery(Object.fromEntries(search))).toEqual(query);
  });
});

describe("productsListInput", () => {
  test("asks for the defaults by leaving them out, in the page's language", () => {
    expect(productsListInput(makeQuery(), "es")).toEqual({ locale: "es" });
  });

  test("asks for every narrowing, the order and the page the selection holds", () => {
    expect(
      productsListInput(
        makeQuery({
          availability: "unavailable",
          categories: ["aros"],
          dir: "desc",
          filters: [{ attribute: "color", values: ["dorado"] }],
          page: 3,
          q: "aro",
          sort: "title",
          status: "draft",
        }),
        "en"
      )
    ).toEqual({
      availability: "unavailable",
      categories: ["aros"],
      dir: "desc",
      filters: [{ attribute: "color", values: ["dorado"] }],
      locale: "en",
      page: 3,
      q: "aro",
      sort: "title",
      status: "draft",
    });
  });

  test("asks for a page of another size when given one", () => {
    expect(productsListInput(makeQuery(), "es", 1)).toEqual({
      limit: 1,
      locale: "es",
    });
  });
});

describe("sortedBy", () => {
  test.each([
    [makeQuery(), "updated", "updated", "asc"],
    [makeQuery({ dir: "asc" }), "updated", "updated", "desc"],
    [makeQuery(), "price", "price", "asc"],
    [makeQuery({ dir: "asc", sort: "price" }), "price", "price", "desc"],
    [makeQuery({ dir: "desc", sort: "price" }), "title", "title", "asc"],
  ] as const)(
    "from %j, sorting by %s gives %s %s",
    (query, sort, expectedSort, expectedDir) => {
      const sorted = sortedBy(query, sort);

      expect([sorted.sort, sorted.dir]).toEqual([expectedSort, expectedDir]);
    }
  );

  test("goes back to the first page and keeps everything else", () => {
    const query = makeQuery({ page: 5, q: "aro", status: "draft" });

    expect(sortedBy(query, "price")).toEqual({
      ...query,
      dir: "asc",
      page: 1,
      sort: "price",
    });
  });
});

describe("isNarrowed", () => {
  test.each([
    ["nothing", makeQuery(), false],
    ["only an order and a page", makeQuery({ page: 3, sort: "price" }), false],
    ["a search", makeQuery({ q: "aro" }), true],
    ["a status", makeQuery({ status: "draft" }), true],
    ["an availability", makeQuery({ availability: "available" }), true],
    ["a category", makeQuery({ categories: ["aros"] }), true],
    [
      "a filter",
      makeQuery({ filters: [{ attribute: "color", values: ["rojo"] }] }),
      true,
    ],
  ])("with %s is %s", (_case, query, expected) => {
    expect(isNarrowed(query)).toBe(expected);
  });
});

describe("withoutFilters", () => {
  test("drops the status, availability, categories and filters, from the first page, keeping the search and order", () => {
    expect(
      withoutFilters(
        makeQuery({
          availability: "available",
          categories: ["aros"],
          dir: "desc",
          filters: [{ attribute: "color", values: ["rojo"] }],
          page: 4,
          q: "aro",
          sort: "price",
          status: "draft",
        })
      )
    ).toEqual(makeQuery({ dir: "desc", q: "aro", sort: "price" }));
  });
});
