import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { StoreProduct } from "@/lib/catalog/product-form";
import { makeStoreProduct } from "@/test/factories/store-product";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { productKey } from "./use-product";
import { productsKey } from "./use-products";
import { useUpdateProduct } from "./use-update-product";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const HELD =
  "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp";
const NEW_PHOTO =
  "https://store.public.blob.vercel-storage.com/local/product/22222222-2222-4222-8222-222222222222.webp";

/** The article saved with a new photo first, the held one second, no price. */
function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    attributeValueIds: [9, 31],
    categoryId: 5,
    id: 12,
    images: [
      { height: 600, url: NEW_PHOTO, width: 800 },
      { height: 900, url: HELD, width: 900 },
    ],
    isAvailable: false,
    priceAmount: null,
    translations: [
      {
        description: "Plata.",
        locale: "es" as const,
        seoDescription: null,
        seoTitle: "Anillo 925",
        title: "Anillo",
      },
      {
        description: "",
        locale: "en" as const,
        seoDescription: null,
        seoTitle: null,
        title: "",
      },
    ],
    ...overrides,
  };
}

const SAVED = {
  id: 12,
  publishGaps: ["price", "englishTitle"],
  slug: "anillo",
  status: "draft",
  updatedAt: "2026-11-16T10:00:00.000Z",
};

/**
 * The hook over a save the test answers when it chooses, with the article
 * already read into the cache.
 */
function setup({
  cached = true,
  fails = false,
}: { cached?: boolean; fails?: boolean } = {}) {
  let answer = (): void => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  const update = vi.fn(async (_input: unknown) => {
    await answered;
    return SAVED;
  });
  server.use(
    fails
      ? createOrpcErrorHandler("product.update", {
          code: "BAD_REQUEST",
          message: "The article cannot be published yet. Missing: price",
          status: 400,
        })
      : createOrpcHandler("product.update", update)
  );
  const wrapper = createQueryWrapper();
  const { queryClient } = wrapper;

  if (cached) {
    queryClient.setQueryData(productKey(12), makeStoreProduct());
  }

  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useUpdateProduct(), { wrapper });
  const cachedProduct = () =>
    queryClient.getQueryData<StoreProduct>(productKey(12));

  return { answer, cachedProduct, invalidateQueries, result, update };
}

describe("useUpdateProduct", () => {
  test("shows the save in the article's read at once, before the server answers", async () => {
    const { answer, cachedProduct, result, update } = setup();

    const saving = result.current.mutateAsync(makeInput());

    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith(makeInput());
    });
    expect(cachedProduct()).toEqual({
      ...makeStoreProduct(),
      attributeValueIds: [9, 31],
      categoryId: 5,
      // The held photo keeps its id; the new one has a temporary one.
      images: [
        { height: 600, id: -1, url: NEW_PHOTO, width: 800 },
        { height: 900, id: 70, url: HELD, width: 900 },
      ],
      isAvailable: false,
      priceAmount: null,
      publishGaps: ["price", "englishTitle"],
      translations: makeInput().translations,
    });

    answer();
    await saving;
  });

  test("puts the server's answer in the read and reads the list again", async () => {
    const { answer, cachedProduct, invalidateQueries, result } = setup();

    answer();
    await expect(result.current.mutateAsync(makeInput())).resolves.toEqual(
      SAVED
    );

    expect(cachedProduct()).toMatchObject({
      categoryId: 5,
      publishGaps: ["price", "englishTitle"],
      slug: "anillo",
      status: "draft",
      updatedAt: "2026-11-16T10:00:00.000Z",
    });
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: productsKey(),
    });
  });

  test("names no gap once the save holds everything publishing needs", async () => {
    const { answer, cachedProduct, result } = setup();

    void result.current.mutateAsync(
      makeInput({
        priceAmount: 0,
        translations: [makeInput().translations[0]],
      })
    );

    await waitFor(() => {
      expect(cachedProduct()?.publishGaps).toEqual([]);
    });
    answer();
  });

  test("puts the read back as it was when the save is refused, and reads no list", async () => {
    const { cachedProduct, invalidateQueries, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(makeInput())).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
        message: "The article cannot be published yet. Missing: price",
      }
    );

    expect(cachedProduct()).toEqual(makeStoreProduct());
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  test("leaves an article never read out of the cache, before and after", async () => {
    const { answer, cachedProduct, result } = setup({ cached: false });

    answer();
    await result.current.mutateAsync(makeInput());

    expect(cachedProduct()).toBeUndefined();
  });
});
