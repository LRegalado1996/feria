import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

import sitemap from "./sitemap";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => {
    await Promise.resolve();
  }),
  findIndexableStore: vi.fn(),
  isStorefrontLaunched: vi.fn<() => boolean>(),
  listIndexableArticles: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("@/lib/env/launch", () => ({
  isStorefrontLaunched: mocks.isStorefrontLaunched,
}));

vi.mock("@/server/services/seo", () => ({
  findIndexableStore: mocks.findIndexableStore,
  listIndexableArticles: mocks.listIndexableArticles,
}));

const ORIGIN = "https://lrmarket.example";
const STORE_UPDATED = new Date("2026-11-10T10:00:00.000Z");
const RING_UPDATED = new Date("2026-11-12T10:00:00.000Z");
const CHAIN_UPDATED = new Date("2026-11-11T10:00:00.000Z");

/** One page in both languages, as the sitemap lists it. */
function pair(spanish: string, english: string, lastModified: Date) {
  const languages = { en: `${ORIGIN}${english}`, es: `${ORIGIN}${spanish}` };

  return [
    { alternates: { languages }, lastModified, url: languages.es },
    { alternates: { languages }, lastModified, url: languages.en },
  ];
}

function setup({
  articles = [
    { slug: "anillo-sello", updatedAt: RING_UPDATED },
    { slug: "cadena", updatedAt: CHAIN_UPDATED },
  ],
  launched = true,
  store = { id: 7, updatedAt: STORE_UPDATED },
}: {
  articles?: { slug: string; updatedAt: Date }[];
  launched?: boolean;
  store?: { id: number; updatedAt: Date } | null;
} = {}) {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  mocks.isStorefrontLaunched.mockReturnValue(launched);
  mocks.findIndexableStore.mockResolvedValue(store);
  mocks.listIndexableArticles.mockResolvedValue(articles);
}

describe("sitemap", () => {
  test("lists the store's home, catalog and articles in both languages, at request time", async () => {
    setup();

    await expect(sitemap()).resolves.toEqual([
      ...pair("/", "/en", STORE_UPDATED),
      // The catalog changed when its newest article did.
      ...pair("/products", "/en/products", RING_UPDATED),
      ...pair(
        "/products/anillo-sello",
        "/en/products/anillo-sello",
        RING_UPDATED
      ),
      ...pair("/products/cadena", "/en/products/cadena", CHAIN_UPDATED),
    ]);
    expect(mocks.connection).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.findIndexableStore).toHaveBeenCalledExactlyOnceWith(db);
    expect(mocks.listIndexableArticles).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
    });
  });

  test("dates the catalog of a store with no articles by the store itself", async () => {
    setup({ articles: [] });

    await expect(sitemap()).resolves.toEqual([
      ...pair("/", "/en", STORE_UPDATED),
      ...pair("/products", "/en/products", STORE_UPDATED),
    ]);
  });

  test("reads only once a request is there, so the build needs no database", async () => {
    setup();

    await sitemap();

    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findIndexableStore.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("lists nothing while the storefront is closed, reading no store", async () => {
    setup({ launched: false });

    await expect(sitemap()).resolves.toEqual([]);
    expect(mocks.findIndexableStore).not.toHaveBeenCalled();
  });

  test("lists nothing when the store's row is missing, reading no article", async () => {
    setup({ store: null });

    await expect(sitemap()).resolves.toEqual([]);
    expect(mocks.listIndexableArticles).not.toHaveBeenCalled();
  });
});
