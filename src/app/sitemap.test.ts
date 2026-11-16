import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

import sitemap from "./sitemap";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => {
    await Promise.resolve();
  }),
  isStorefrontLaunched: vi.fn<() => boolean>(),
  listIndexableArticles: vi.fn(),
  listIndexableStores: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("@/lib/env/launch", () => ({
  isStorefrontLaunched: mocks.isStorefrontLaunched,
}));

vi.mock("@/server/services/seo", () => ({
  listIndexableArticles: mocks.listIndexableArticles,
  listIndexableStores: mocks.listIndexableStores,
}));

const ORIGIN = "https://lrmarket.example";
const STORE_UPDATED = new Date("2026-11-10T10:00:00.000Z");
const RING_UPDATED = new Date("2026-11-12T10:00:00.000Z");
const CHAIN_UPDATED = new Date("2026-11-11T10:00:00.000Z");

/** The page at `path` in both languages, as the sitemap lists it. */
function pair(path: string, lastModified: Date) {
  const languages = {
    en: `${ORIGIN}/en${path}`,
    es: `${ORIGIN}${path}`,
  };

  return [
    { alternates: { languages }, lastModified, url: languages.es },
    { alternates: { languages }, lastModified, url: languages.en },
  ];
}

function setup({ launched = true } = {}) {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  mocks.isStorefrontLaunched.mockReturnValue(launched);
  mocks.listIndexableStores.mockResolvedValue([
    { id: 7, slug: "lr-market", updatedAt: STORE_UPDATED },
    { id: 8, slug: "otra-tienda", updatedAt: STORE_UPDATED },
  ]);
  mocks.listIndexableArticles.mockImplementation(
    async (_db: unknown, { storeId }: { storeId: number }) =>
      await Promise.resolve(
        storeId === 7
          ? [
              { slug: "anillo-sello", updatedAt: RING_UPDATED },
              { slug: "cadena", updatedAt: CHAIN_UPDATED },
            ]
          : []
      )
  );
}

describe("sitemap", () => {
  test("lists each active store's home, catalog and articles in both languages, at request time", async () => {
    setup();

    await expect(sitemap()).resolves.toEqual([
      ...pair("/lr-market", STORE_UPDATED),
      // The catalog changed when its newest article did.
      ...pair("/lr-market/products", RING_UPDATED),
      ...pair("/lr-market/products/anillo-sello", RING_UPDATED),
      ...pair("/lr-market/products/cadena", CHAIN_UPDATED),
      ...pair("/otra-tienda", STORE_UPDATED),
      ...pair("/otra-tienda/products", STORE_UPDATED),
    ]);
    expect(mocks.connection).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.listIndexableStores).toHaveBeenCalledExactlyOnceWith(db);
    expect(mocks.listIndexableArticles.mock.calls).toEqual([
      [db, { storeId: 7 }],
      [db, { storeId: 8 }],
    ]);
  });

  test("lists nothing while the storefront is closed, reading no store", async () => {
    setup({ launched: false });

    await expect(sitemap()).resolves.toEqual([]);
    expect(mocks.listIndexableStores).not.toHaveBeenCalled();
  });
});
