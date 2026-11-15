import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { createUnauthenticatedMockContext } from "@/server/test/context";

import { catalogRouter } from "./catalog";

// The router is input → store → service. The queries are
// `src/server/services/catalog.test.ts`'s.

const services = vi.hoisted(() => ({
  findActiveStoreBySlug: vi.fn(),
  getPublishedProduct: vi.fn(),
  listCategories: vi.fn(),
  listPublishedProducts: vi.fn(),
  listRelatedProducts: vi.fn(),
}));

vi.mock("@/server/services/catalog", () => ({
  getPublishedProduct: services.getPublishedProduct,
  listCategories: services.listCategories,
  listPublishedProducts: services.listPublishedProducts,
  listRelatedProducts: services.listRelatedProducts,
}));

vi.mock("@/server/services/store", () => ({
  findActiveStoreBySlug: services.findActiveStoreBySlug,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORE = { currencyCode: "USD", id: 7, slug: "tienda-demo" };

/** A signed-out visitor; the store at `tienda-demo` is active unless told not. */
function setup({ storeActive = true } = {}) {
  const { mockCtx } = createUnauthenticatedMockContext();
  services.findActiveStoreBySlug.mockImplementation(
    async (_db: unknown, slug: string) =>
      storeActive && slug === STORE.slug ? STORE : null
  );
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    categories: async (input: unknown) =>
      await call(catalogRouter.categories, input as never, options),
    product: async (input: unknown) =>
      await call(catalogRouter.product, input as never, options),
    products: async (input: unknown) =>
      await call(catalogRouter.products, input as never, options),
    related: async (input: unknown) =>
      await call(catalogRouter.related, input as never, options),
  };
}

const STORE_NOT_FOUND = { code: "NOT_FOUND", message: "Store not found" };

describe("catalog router", () => {
  test("lists a store's categories in the visitor's language, scoped by the resolved store", async () => {
    const { categories, db } = setup();
    services.listCategories.mockResolvedValue([{ id: 1, name: "Chains" }]);

    await expect(
      categories({ locale: "en", storeSlug: "tienda-demo" })
    ).resolves.toEqual([{ id: 1, name: "Chains" }]);
    expect(services.listCategories).toHaveBeenCalledExactlyOnceWith(db, {
      locale: "en",
      storeId: 7,
    });
  });

  test("lists articles with the filters, the store's id and its currency, never the input's", async () => {
    const { db, products } = setup();
    services.listPublishedProducts.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await products({
      category: "cadenas",
      locale: "es",
      q: " oro ",
      storeSlug: "tienda-demo",
    });

    expect(services.listPublishedProducts).toHaveBeenCalledExactlyOnceWith(db, {
      category: "cadenas",
      currencyCode: "USD",
      limit: 24,
      locale: "es",
      q: "oro",
      storeId: 7,
    });
  });

  test("gets one published article by its slug in the store", async () => {
    const { db, product } = setup();
    services.getPublishedProduct.mockResolvedValue({ id: 3, slug: "cadena" });

    await expect(
      product({ locale: "es", slug: "cadena", storeSlug: "tienda-demo" })
    ).resolves.toEqual({ id: 3, slug: "cadena" });
    expect(services.getPublishedProduct).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      locale: "es",
      slug: "cadena",
      storeId: 7,
    });
  });

  test("lists the related articles of the article's own category, without it", async () => {
    const { db, related } = setup();
    services.getPublishedProduct.mockResolvedValue({ categoryId: 4, id: 3 });
    services.listRelatedProducts.mockResolvedValue([{ id: 9 }]);

    await expect(
      related({ locale: "en", slug: "cadena", storeSlug: "tienda-demo" })
    ).resolves.toEqual([{ id: 9 }]);
    expect(services.listRelatedProducts).toHaveBeenCalledExactlyOnceWith(db, {
      categoryId: 4,
      currencyCode: "USD",
      limit: 4,
      locale: "en",
      productId: 3,
      storeId: 7,
    });
  });

  test.each(["categories", "products", "product", "related"] as const)(
    "%s answers NOT_FOUND for an inactive or unknown store, before any catalog read",
    async (procedure) => {
      const routes = setup({ storeActive: false });

      await expect(
        routes[procedure]({
          locale: "es",
          slug: "cadena",
          storeSlug: "tienda-demo",
        })
      ).rejects.toMatchObject(STORE_NOT_FOUND);
      expect(services.listCategories).not.toHaveBeenCalled();
      expect(services.listPublishedProducts).not.toHaveBeenCalled();
      expect(services.getPublishedProduct).not.toHaveBeenCalled();
    }
  );

  test("refuses a page size over the maximum before resolving the store", async () => {
    const { products } = setup();

    await expect(
      products({ limit: 49, locale: "es", storeSlug: "tienda-demo" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(services.findActiveStoreBySlug).not.toHaveBeenCalled();
  });
});
