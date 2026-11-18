import { describe, expect, test } from "vitest";

import { en } from "@/content/en";
import { es } from "@/content/es";
import { EMPTY_PRODUCTS_QUERY, type ProductsQuery } from "@/lib/admin/products";
import { makeStoreCategory } from "@/test/factories/store-category";

import {
  activeFilterChips,
  applyFilterForm,
  EMPTY_FILTER_FORM,
  filterFormValues,
  type ListAttribute,
  nameIn,
  valueToken,
} from "./product-filters";

function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return { ...EMPTY_PRODUCTS_QUERY, ...overrides };
}

type ListValue = ListAttribute["values"][number];

function makeValue(overrides: Partial<ListValue> = {}): ListValue {
  return {
    id: 21,
    nameEn: "Gold",
    nameEs: "Dorado",
    position: 0,
    productCount: 3,
    slug: "dorado",
    swatchColor: "#d4af37",
    ...overrides,
  };
}

function makeAttribute(overrides: Partial<ListAttribute> = {}): ListAttribute {
  return {
    id: 2,
    nameEn: "Color",
    nameEs: "Color",
    position: 0,
    slug: "color",
    values: [
      makeValue(),
      makeValue({
        id: 22,
        nameEn: "Purple",
        nameEs: "Violeta",
        position: 1,
        slug: "violeta",
        swatchColor: "#7c3aed",
      }),
    ],
    ...overrides,
  };
}

const MATERIAL = makeAttribute({
  id: 3,
  nameEn: null,
  nameEs: "Material",
  position: 1,
  slug: "material",
  values: [
    makeValue({
      id: 31,
      nameEn: null,
      nameEs: "Plata",
      slug: "plata",
      swatchColor: null,
    }),
  ],
});

/** Rings, then earrings, in the store's order. */
function setup() {
  const categories = [
    makeStoreCategory({
      id: 4,
      nameEn: "Rings",
      nameEs: "Anillos",
      slug: "anillos",
    }),
    makeStoreCategory({
      id: 5,
      nameEn: null,
      nameEs: "Aros",
      position: 1,
      slug: "aros",
    }),
  ];
  const attributes = [makeAttribute(), MATERIAL];

  return { attributes, categories };
}

describe("nameIn", () => {
  test.each([
    ["en", { nameEn: "Rings", nameEs: "Anillos" }, "Rings"],
    ["en", { nameEn: null, nameEs: "Anillos" }, "Anillos"],
    ["es", { nameEn: "Rings", nameEs: "Anillos" }, "Anillos"],
  ] as const)("in %s names %j %s", (locale, row, expected) => {
    expect(nameIn(row, locale)).toBe(expected);
  });
});

describe("activeFilterChips", () => {
  test("has no chip while nothing narrows the list", () => {
    const { attributes, categories } = setup();

    expect(
      activeFilterChips(makeQuery({ page: 3, q: "aro" }), {
        attributes,
        categories,
        copy: es.articles.list,
        locale: "es",
      })
    ).toEqual([]);
  });

  test("names every active value in the panel's order, each leading to the selection without it, from the first page", () => {
    const { attributes, categories } = setup();
    const query = makeQuery({
      availability: "unavailable",
      categories: ["aros", "anillos"],
      filters: [
        { attribute: "material", values: ["plata"] },
        { attribute: "color", values: ["violeta", "dorado"] },
      ],
      page: 3,
      q: "aro",
      status: "draft",
    });
    const from = { ...query, page: 1 };

    expect(
      activeFilterChips(query, {
        attributes,
        categories,
        copy: es.articles.list,
        locale: "es",
      })
    ).toEqual([
      {
        filter: "Estado",
        id: "status",
        swatchColor: null,
        value: "Borrador",
        without: { ...from, status: null },
      },
      {
        filter: "Disponibilidad",
        id: "availability",
        swatchColor: null,
        value: "No disponible",
        without: { ...from, availability: null },
      },
      {
        filter: "Categoría",
        id: "category:anillos",
        swatchColor: null,
        value: "Anillos",
        without: { ...from, categories: ["aros"] },
      },
      {
        filter: "Categoría",
        id: "category:aros",
        swatchColor: null,
        value: "Aros",
        without: { ...from, categories: ["anillos"] },
      },
      {
        filter: "Color",
        id: "filter:color:dorado",
        swatchColor: "#d4af37",
        value: "Dorado",
        without: {
          ...from,
          filters: [
            { attribute: "material", values: ["plata"] },
            { attribute: "color", values: ["violeta"] },
          ],
        },
      },
      {
        filter: "Color",
        id: "filter:color:violeta",
        swatchColor: "#7c3aed",
        value: "Violeta",
        without: {
          ...from,
          filters: [
            { attribute: "material", values: ["plata"] },
            { attribute: "color", values: ["dorado"] },
          ],
        },
      },
      {
        filter: "Material",
        id: "filter:material:plata",
        swatchColor: null,
        value: "Plata",
        // The filter's last value gone, the filter goes with it.
        without: {
          ...from,
          filters: [{ attribute: "color", values: ["violeta", "dorado"] }],
        },
      },
    ]);
  });

  test("names the values in English, else Spanish, on an English page", () => {
    const { attributes, categories } = setup();

    expect(
      activeFilterChips(
        makeQuery({
          categories: ["anillos", "aros"],
          filters: [{ attribute: "material", values: ["plata"] }],
          status: "published",
        }),
        { attributes, categories, copy: en.articles.list, locale: "en" }
      ).map((chip) => `${chip.filter}: ${chip.value}`)
    ).toEqual([
      "Status: Published",
      "Category: Rings",
      "Category: Aros",
      "Material: Plata",
    ]);
  });

  test("gives no chip to a category, filter or value the store does not have", () => {
    const { attributes, categories } = setup();

    expect(
      activeFilterChips(
        makeQuery({
          categories: ["relojes"],
          filters: [
            { attribute: "talle", values: ["s"] },
            { attribute: "color", values: ["rojo"] },
          ],
        }),
        { attributes, categories, copy: es.articles.list, locale: "es" }
      )
    ).toEqual([]);
  });
});

describe("filter form values", () => {
  test("the empty form chooses nothing", () => {
    expect(EMPTY_FILTER_FORM).toEqual({
      availability: "",
      categories: [],
      status: "",
      values: [],
    });
  });

  test("a value's token is its filter and its slug", () => {
    expect(valueToken("color", "dorado")).toBe("color:dorado");
  });

  test.each([
    ["nothing", makeQuery(), EMPTY_FILTER_FORM],
    [
      "a whole selection",
      makeQuery({
        availability: "available",
        categories: ["aros"],
        filters: [
          { attribute: "color", values: ["dorado", "violeta"] },
          { attribute: "material", values: ["plata"] },
        ],
        status: "published",
      }),
      {
        availability: "available",
        categories: ["aros"],
        status: "published",
        values: ["color:dorado", "color:violeta", "material:plata"],
      },
    ],
  ])("the form opens on %s", (_case, query, expected) => {
    expect(filterFormValues(query)).toEqual(expected);
  });

  test("applying puts the choice in the store's order, from the first page, keeping the search and order", () => {
    const { attributes, categories } = setup();
    const query = makeQuery({
      categories: ["anillos"],
      dir: "desc",
      page: 4,
      q: "aro",
      sort: "price",
    });

    expect(
      applyFilterForm(
        query,
        {
          availability: "unavailable",
          categories: ["aros", "relojes", "anillos"],
          status: "draft",
          values: [
            "material:plata",
            "color:violeta",
            "color:rojo",
            "talle:s",
            "color:dorado",
          ],
        },
        { attributes, categories }
      )
    ).toEqual({
      ...query,
      availability: "unavailable",
      categories: ["anillos", "aros"],
      filters: [
        { attribute: "color", values: ["dorado", "violeta"] },
        { attribute: "material", values: ["plata"] },
      ],
      page: 1,
      status: "draft",
    });
  });

  test.each([
    ["neither list is read", false, false, ["relojes"], ["rojo", "dorado"]],
    ["only the filters are read", false, true, ["relojes"], ["dorado"]],
    ["only the categories are read", true, false, [], ["rojo", "dorado"]],
  ])(
    "while %s, applying keeps the address's slugs no list can vouch for, less those the form let go",
    (_case, categoriesRead, attributesRead, kept, colors) => {
      const { attributes, categories } = setup();
      const query = makeQuery({
        categories: ["relojes", "aros"],
        filters: [
          { attribute: "color", values: ["rojo", "dorado"] },
          { attribute: "talle", values: ["s"] },
        ],
        page: 3,
      });

      expect(
        applyFilterForm(
          query,
          {
            ...filterFormValues(query),
            // Let go in the form: a category and a whole filter.
            categories: ["relojes"],
            values: ["color:rojo", "color:dorado"],
          },
          {
            attributes: attributesRead ? attributes : undefined,
            categories: categoriesRead ? categories : undefined,
          }
        )
      ).toEqual({
        ...query,
        categories: kept,
        filters: [{ attribute: "color", values: colors }],
        page: 1,
      });
    }
  );

  test("applying the empty form clears every filter", () => {
    const { attributes, categories } = setup();
    const query = makeQuery({
      availability: "available",
      categories: ["aros"],
      filters: [{ attribute: "color", values: ["dorado"] }],
      page: 2,
      status: "draft",
    });

    expect(
      applyFilterForm(query, EMPTY_FILTER_FORM, { attributes, categories })
    ).toEqual(makeQuery());
  });
});
