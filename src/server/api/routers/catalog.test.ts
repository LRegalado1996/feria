import { call, ORPCError } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { createUnauthenticatedMockContext } from "@/server/test/context";

import { catalogRouter } from "./catalog";

// The router is input → store → service. The queries are
// `src/server/services/catalog.test.ts`'s.

const services = vi.hoisted(() => ({
  getStore: vi.fn(),
  getPublishedProduct: vi.fn(),
  getPublishedProductRef: vi.fn(),
  listCartProducts: vi.fn(),
  listCatalogFilters: vi.fn(),
  listCategories: vi.fn(),
  listPublishedProducts: vi.fn(),
  listRelatedProducts: vi.fn(),
  resolveCatalogFilters: vi.fn(),
}));

vi.mock("@/server/services/attribute", () => ({
  listCatalogFilters: services.listCatalogFilters,
  resolveCatalogFilters: services.resolveCatalogFilters,
}));

vi.mock("@/server/services/catalog", () => ({
  getPublishedProduct: services.getPublishedProduct,
  getPublishedProductRef: services.getPublishedProductRef,
  listCartProducts: services.listCartProducts,
  listCategories: services.listCategories,
  listPublishedProducts: services.listPublishedProducts,
  listRelatedProducts: services.listRelatedProducts,
}));

vi.mock("@/server/services/store", () => ({
  getStore: services.getStore,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORE = { currencyCode: "USD", id: 7 };

/**
 * A signed-out visitor; the store's row is there unless told not (a database
 * whose migrations have not run).
 */
function setup({ storeExists = true } = {}) {
  const { mockCtx } = createUnauthenticatedMockContext();
  services.getStore.mockImplementation(async () => {
    if (storeExists) {
      return await Promise.resolve(STORE);
    }

    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  });
  // The URL's filters resolve to value ids only for the store's own id.
  services.resolveCatalogFilters.mockImplementation(
    async (_db: unknown, { storeId }: { storeId: number }) =>
      await Promise.resolve(storeId === STORE.id ? [[21, 22], [31]] : [])
  );
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    cartProducts: async (input: unknown) =>
      await call(catalogRouter.cartProducts, input as never, options),
    categories: async (input: unknown) =>
      await call(catalogRouter.categories, input as never, options),
    filters: async (input: unknown) =>
      await call(catalogRouter.filters, input as never, options),
    product: async (input: unknown) =>
      await call(catalogRouter.product, input as never, options),
    products: async (input: unknown) =>
      await call(catalogRouter.products, input as never, options),
    related: async (input: unknown) =>
      await call(catalogRouter.related, input as never, options),
  };
}

/** `count` filters of `values` value slugs each, all of them valid. */
function makeFilters(count: number, values: number) {
  return Array.from({ length: count }, (_, index) => ({
    attribute: `filtro-${String(index)}`,
    values: Array.from(
      { length: values },
      (_value, valueIndex) => `valor-${String(valueIndex)}`
    ),
  }));
}

const STORE_NOT_FOUND = { code: "NOT_FOUND", message: "Store not found" };

const INPUT_INVALID = {
  code: "BAD_REQUEST",
  message: "Input validation failed",
};

/** The ids 1 to `count`, each once. */
function makeIds(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1);
}

describe("catalog router", () => {
  test("lists the store's categories in the visitor's language, scoped by the store", async () => {
    const { categories, db } = setup();
    services.listCategories.mockResolvedValue([{ id: 1, name: "Chains" }]);

    await expect(categories({ locale: "en" })).resolves.toEqual([
      { id: 1, name: "Chains" },
    ]);
    expect(services.listCategories).toHaveBeenCalledExactlyOnceWith(db, {
      locale: "en",
      storeId: 7,
    });
  });

  test("lists articles with the filters, the store's id and its currency, never the input's", async () => {
    const { db, products } = setup();
    services.listPublishedProducts.mockResolvedValue({
      items: [{ id: 3 }],
      nextCursor: null,
    });
    const filters = [
      { attribute: "color", values: ["dorado", "plateado"] },
      { attribute: "talle", values: ["m"] },
    ];

    await expect(
      products({
        category: "cadenas",
        filters,
        locale: "es",
        q: " oro ",
        sort: "price_desc",
      })
    ).resolves.toEqual({ items: [{ id: 3 }], nextCursor: null });

    expect(services.resolveCatalogFilters).toHaveBeenCalledExactlyOnceWith(db, {
      filters,
      storeId: 7,
    });
    // The URL's slugs never reach the listing: only the resolved value ids.
    expect(services.listPublishedProducts).toHaveBeenCalledExactlyOnceWith(db, {
      category: "cadenas",
      currencyCode: "USD",
      limit: 24,
      locale: "es",
      q: "oro",
      sort: "price_desc",
      storeId: 7,
      valueGroups: [[21, 22], [31]],
    });
  });

  test("resolves no filters when the URL asks for none", async () => {
    const { db, products } = setup();
    services.resolveCatalogFilters.mockResolvedValue([]);
    services.listPublishedProducts.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await products({ locale: "en" });

    expect(services.resolveCatalogFilters).toHaveBeenCalledExactlyOnceWith(db, {
      filters: [],
      storeId: 7,
    });
    expect(services.listPublishedProducts).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      limit: 24,
      locale: "en",
      // No sort asked: the newest first.
      sort: "newest",
      storeId: 7,
      valueGroups: [],
    });
  });

  test.each([
    ["10 filters", 10, 1],
    ["a filter with 20 values", 1, 20],
  ])("lists articles with %s", async (_case, filterCount, valueCount) => {
    const { db, products } = setup();
    services.listPublishedProducts.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const filters = makeFilters(filterCount, valueCount);

    await expect(products({ filters, locale: "es" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(services.resolveCatalogFilters).toHaveBeenCalledExactlyOnceWith(db, {
      filters,
      storeId: 7,
    });
  });

  test.each([
    ["more than 10 filters", 11, 1],
    ["a filter with more than 20 values", 1, 21],
  ])(
    "refuses %s before resolving the store",
    async (_case, filterCount, valueCount) => {
      const { products } = setup();

      await expect(
        products({
          filters: makeFilters(filterCount, valueCount),
          locale: "es",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      expect(services.getStore).not.toHaveBeenCalled();
      expect(services.resolveCatalogFilters).not.toHaveBeenCalled();
    }
  );

  test("lists the store's filters in the visitor's language, scoped by the store", async () => {
    const { db, filters } = setup();
    const answer = [
      {
        lang: "en",
        name: "Color",
        slug: "color",
        values: [
          {
            count: 2,
            lang: "en",
            name: "Gold",
            slug: "dorado",
            swatchColor: "#d4af37",
          },
        ],
      },
    ];
    services.listCatalogFilters.mockResolvedValue(answer);

    await expect(filters({ locale: "en" })).resolves.toEqual(answer);
    expect(services.getStore).toHaveBeenCalledExactlyOnceWith(db);
    expect(services.listCatalogFilters).toHaveBeenCalledExactlyOnceWith(db, {
      locale: "en",
      storeId: 7,
    });
  });

  test("refuses filters in an unknown language before resolving the store", async () => {
    const { filters } = setup();

    await expect(filters({ locale: "fr" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(services.getStore).not.toHaveBeenCalled();
    expect(services.listCatalogFilters).not.toHaveBeenCalled();
  });

  test("gets one published article by its slug in the store", async () => {
    const { db, product } = setup();
    services.getPublishedProduct.mockResolvedValue({ id: 3, slug: "cadena" });

    await expect(product({ locale: "es", slug: "cadena" })).resolves.toEqual({
      id: 3,
      slug: "cadena",
    });
    expect(services.getPublishedProduct).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      locale: "es",
      slug: "cadena",
      storeId: 7,
    });
  });

  test("lists the related articles of the article's own category, without it", async () => {
    const { db, related } = setup();
    services.getPublishedProductRef.mockResolvedValue({ categoryId: 4, id: 3 });
    services.listRelatedProducts.mockResolvedValue([{ id: 9 }]);

    await expect(related({ locale: "en", slug: "cadena" })).resolves.toEqual([
      { id: 9 },
    ]);
    expect(services.listRelatedProducts).toHaveBeenCalledExactlyOnceWith(db, {
      categoryId: 4,
      currencyCode: "USD",
      limit: 4,
      locale: "en",
      productId: 3,
      storeId: 7,
    });
    expect(services.getPublishedProductRef).toHaveBeenCalledExactlyOnceWith(
      db,
      {
        slug: "cadena",
        storeId: 7,
      }
    );
    expect(services.getPublishedProduct).not.toHaveBeenCalled();
  });

  test.each([
    "categories",
    "filters",
    "products",
    "product",
    "related",
  ] as const)(
    "%s answers NOT_FOUND before the store's row exists, before any catalog read",
    async (procedure) => {
      const routes = setup({ storeExists: false });

      await expect(
        routes[procedure]({
          locale: "es",
          slug: "cadena",
        })
      ).rejects.toMatchObject(STORE_NOT_FOUND);
      expect(services.listCategories).not.toHaveBeenCalled();
      expect(services.listCatalogFilters).not.toHaveBeenCalled();
      expect(services.resolveCatalogFilters).not.toHaveBeenCalled();
      expect(services.listPublishedProducts).not.toHaveBeenCalled();
      expect(services.getPublishedProduct).not.toHaveBeenCalled();
      expect(services.getPublishedProductRef).not.toHaveBeenCalled();
    }
  );

  test("refuses a page size over the maximum before resolving the store", async () => {
    const { products } = setup();

    await expect(products({ limit: 49, locale: "es" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(services.getStore).not.toHaveBeenCalled();
  });
});

describe("catalog.cartProducts", () => {
  test("reads the cart's articles in the store's currency, scoped by the store, in the order asked", async () => {
    const { cartProducts, db } = setup();
    services.listCartProducts.mockResolvedValue([{ id: 9 }, { id: 3 }]);

    await expect(cartProducts({ ids: [9, 3], locale: "en" })).resolves.toEqual([
      { id: 9 },
      { id: 3 },
    ]);
    expect(services.getStore).toHaveBeenCalledExactlyOnceWith(db);
    expect(services.listCartProducts).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      ids: [9, 3],
      locale: "en",
      storeId: 7,
    });
  });

  test("reads ids sent as text, as the REST surface's query string sends them", async () => {
    const { cartProducts, db } = setup();
    services.listCartProducts.mockResolvedValue([]);

    await cartProducts({
      ids: ["4", "12"],
      locale: "es",
    });

    expect(services.listCartProducts).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      ids: [4, 12],
      locale: "es",
      storeId: 7,
    });
  });

  test("answers NOT_FOUND before the store's row exists, before any catalog read", async () => {
    const { cartProducts } = setup({ storeExists: false });

    await expect(
      cartProducts({ ids: [3], locale: "es" })
    ).rejects.toMatchObject(STORE_NOT_FOUND);
    expect(services.listCartProducts).not.toHaveBeenCalled();
  });

  test("accepts a full cart of 20 articles", async () => {
    const { cartProducts, db } = setup();
    services.listCartProducts.mockResolvedValue([]);

    await expect(
      cartProducts({ ids: makeIds(20), locale: "es" })
    ).resolves.toEqual([]);
    expect(services.listCartProducts).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      ids: makeIds(20),
      locale: "es",
      storeId: 7,
    });
  });

  test.each([
    ["no ids", []],
    ["21 ids, one past a full cart", makeIds(21)],
    ["the same id twice", [3, 4, 3]],
    ["an empty id, which Number() reads as 0", [""]],
    ["a negative id", [-1]],
  ])("refuses %s before resolving the store", async (_case, ids: unknown[]) => {
    const { cartProducts } = setup();

    await expect(cartProducts({ ids, locale: "es" })).rejects.toMatchObject(
      INPUT_INVALID
    );
    expect(services.getStore).not.toHaveBeenCalled();
    expect(services.listCartProducts).not.toHaveBeenCalled();
  });

  test("refuses an unknown language before resolving the store", async () => {
    const { cartProducts } = setup();

    await expect(
      cartProducts({ ids: [3], locale: "fr" })
    ).rejects.toMatchObject(INPUT_INVALID);
    expect(services.getStore).not.toHaveBeenCalled();
  });
});
