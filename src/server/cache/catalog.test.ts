import { ORPCError } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CATALOG_SLUG_MAX_LENGTH } from "@/lib/schemas/catalog";
import type { Currency } from "@/lib/utils/format";
import { db } from "@/server/db";

import {
  invalidateCatalogCache,
  readCategories,
  readPublishedArticle,
  readRelatedArticles,
} from "./catalog";

const { cacheLife, cacheTag, revalidateTag } = vi.hoisted(() => ({
  cacheLife: vi.fn<(profile: string) => void>(),
  cacheTag: vi.fn<(...tags: string[]) => void>(),
  revalidateTag: vi.fn<(tag: string, profile: unknown) => void>(),
}));

// The queries are `src/server/services/catalog.test.ts`'s: here only what the
// cache layer adds around them.
const { getPublishedProduct, listCategories, listRelatedProducts } = vi.hoisted(
  () => ({
    getPublishedProduct: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    listCategories: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    listRelatedProducts: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  })
);

// Next's cache only exists inside a Next render. Outside it `"use cache"` is
// a plain string, so the function under test runs on every call.
vi.mock("next/cache", () => ({ cacheLife, cacheTag, revalidateTag }));

vi.mock("@/server/services/catalog", () => ({
  getPublishedProduct,
  listCategories,
  listRelatedProducts,
}));

function makeStore(): { currencyCode: Currency; id: number } {
  return { currencyCode: "USD", id: 7 };
}

function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: 3,
    id: 11,
    name: "Cadena",
    slug: "cadena",
    ...overrides,
  };
}

/**
 * The services answering with an article (or failing with `error`) and a
 * list beside it, and both reads on store 7.
 */
function setup({ error }: { error?: Error } = {}) {
  const article = makeArticle();
  const related = [makeArticle({ id: 12, slug: "anillo" })];
  if (error === undefined) {
    getPublishedProduct.mockResolvedValue(article);
  } else {
    getPublishedProduct.mockRejectedValue(error);
  }
  listRelatedProducts.mockResolvedValue(related);

  return {
    article,
    readArticle: async ({
      locale = "es",
      slug = "cadena",
    }: { locale?: Locale; slug?: string } = {}) =>
      await readPublishedArticle(makeStore(), slug, locale),
    readRelated: async (
      beside: { categoryId: number | null; id: number },
      locale: Locale = "es"
    ) => await readRelatedArticles(makeStore(), beside, locale),
    related,
  };
}

describe("readPublishedArticle", () => {
  test("answers the store's published article at that address, in that language and currency", async () => {
    const { article, readArticle } = setup();

    await expect(readArticle({ locale: "en" })).resolves.toBe(article);

    expect(getPublishedProduct).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      locale: "en",
      slug: "cadena",
      storeId: 7,
    });
  });

  test("answers null for a draft or a missing article, so the page is a 404", async () => {
    const { readArticle } = setup({
      error: new ORPCError("NOT_FOUND", { message: "Product not found" }),
    });

    await expect(readArticle({ slug: "borrador" })).resolves.toBeNull();
  });

  test.each([
    [
      "another oRPC error",
      new ORPCError("FORBIDDEN", { message: "Forbidden" }),
    ],
    ["an unexpected failure", new Error("connection refused")],
    [
      "a failure from outside oRPC that carries the same code",
      Object.assign(new Error("lookup failed"), { code: "NOT_FOUND" }),
    ],
  ])("rethrows %s instead of hiding it as a 404", async (_case, error) => {
    const { readArticle } = setup({ error });

    await expect(readArticle()).rejects.toBe(error);
  });

  test("reads an address as long as an article's can be", async () => {
    const { article, readArticle } = setup();
    const slug = "a".repeat(CATALOG_SLUG_MAX_LENGTH);

    await expect(readArticle({ slug })).resolves.toBe(article);

    expect(getPublishedProduct).toHaveBeenCalledExactlyOnceWith(
      db,
      expect.objectContaining({ slug })
    );
  });

  test.each([
    ["one character too long", "a".repeat(CATALOG_SLUG_MAX_LENGTH + 1)],
    ["with a capital", "Cadena"],
    ["with an underscore", "__sample__"],
    ["empty", ""],
    ["padded with spaces", " cadena "],
  ])(
    "answers null for an address %s without a query or a cache entry",
    async (_case, slug) => {
      const { readArticle } = setup();

      await expect(readArticle({ slug })).resolves.toBeNull();

      expect(getPublishedProduct).not.toHaveBeenCalled();
      expect(cacheTag).not.toHaveBeenCalled();
    }
  );
});

describe("readRelatedArticles", () => {
  test("lists up to four articles beside this one, from its category, in that language and currency", async () => {
    const { readRelated, related } = setup();

    await expect(readRelated({ categoryId: 3, id: 11 }, "en")).resolves.toBe(
      related
    );

    expect(listRelatedProducts).toHaveBeenCalledExactlyOnceWith(db, {
      categoryId: 3,
      currencyCode: "USD",
      limit: 4,
      locale: "en",
      productId: 11,
      storeId: 7,
    });
  });
});

describe("readCategories", () => {
  test("lists the store's categories in that language", async () => {
    const categories = [
      { id: 3, lang: "en", name: "Rings", position: 0, slug: "anillos" },
    ];
    listCategories.mockResolvedValue(categories);

    await expect(readCategories({ id: 7 }, "en")).resolves.toBe(categories);

    expect(listCategories).toHaveBeenCalledExactlyOnceWith(db, {
      locale: "en",
      storeId: 7,
    });
  });
});

describe("cached reads", () => {
  test.each([
    [
      "the article",
      async ({ readArticle }: ReturnType<typeof setup>) => await readArticle(),
    ],
    [
      "the articles beside it",
      async ({ readRelated }: ReturnType<typeof setup>) =>
        await readRelated({ categoryId: null, id: 11 }),
    ],
    ["the categories", async () => await readCategories({ id: 7 }, "es")],
  ])(
    "tag %s with the store's catalog and keep it for hours",
    async (_case, read) => {
      await read(setup());

      expect(cacheTag).toHaveBeenCalledExactlyOnceWith("catalog:7");
      expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
    }
  );
});

describe("invalidateCatalogCache", () => {
  test("expires the store's catalog tag at once, serving nothing stale", () => {
    invalidateCatalogCache(7);

    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("catalog:7", {
      expire: 0,
    });
  });
});
