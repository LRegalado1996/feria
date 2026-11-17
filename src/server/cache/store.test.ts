import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import type { MockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import {
  getDefaultStore,
  getStoreForPath,
  invalidateStoreCache,
} from "./store";

const { cacheLife, cacheTag, revalidateTag } = vi.hoisted(() => ({
  cacheLife: vi.fn<(profile: string) => void>(),
  cacheTag: vi.fn<(...tags: string[]) => void>(),
  revalidateTag: vi.fn<(tag: string, profile: unknown) => void>(),
}));

// Next's cache only exists inside a Next render. Outside it `"use cache"` is
// a plain string, so the function under test runs on every call.
vi.mock("next/cache", () => ({ cacheLife, cacheTag, revalidateTag }));

function setup({ found }: { found?: { id: number; slug: string } } = {}) {
  // `@/server/db` is the passive double for every unit test (setup-common).
  const database = db as unknown as MockDatabase;
  database.query.store.findFirst.mockResolvedValue(found);

  return { findFirst: database.query.store.findFirst };
}

describe("getDefaultStore", () => {
  test("returns the default store, read through the service, under the default's tag", async () => {
    const found = { id: 7, slug: "lr-market" };
    const { findFirst } = setup({ found });

    await expect(getDefaultStore()).resolves.toBe(found);

    const query = findFirst.mock.calls[0]?.[0] as { where: unknown };
    expect(renderQuery(query.where)).toEqual({
      sql: '"store"."isDefault" = $1',
      params: [true],
    });
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("store-default");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  test("answers null when no store is the default", async () => {
    setup();

    await expect(getDefaultStore()).resolves.toBeNull();
  });
});

describe("getStoreForPath", () => {
  test("returns the active store at that address, read through the service", async () => {
    const found = { id: 7, slug: "lr-market" };
    const { findFirst } = setup({ found });

    await expect(getStoreForPath("lr-market")).resolves.toBe(found);

    const query = findFirst.mock.calls[0]?.[0] as { where: unknown };
    expect(renderQuery(query.where)).toEqual({
      sql: '("store"."slug" = $1 and "store"."isActive" = $2)',
      params: ["lr-market", true],
    });
  });

  test("tags a found store by its address and by its id, so an edit under any slug reaches it", async () => {
    setup({ found: { id: 7, slug: "lr-market" } });

    await getStoreForPath("lr-market");

    expect(cacheTag.mock.calls).toEqual([
      ["store-slug:lr-market"],
      ["store:7"],
    ]);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  test("tags a missing store by its address only, so creating it there drops the cached miss", async () => {
    setup();

    await expect(getStoreForPath("not-a-store-yet")).resolves.toBeNull();

    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(
      "store-slug:not-a-store-yet"
    );
  });

  test.each([
    ["a reserved segment", "admin"],
    ["the build's sample segment", "__sample__"],
    ["an uppercase address", "LR-Market"],
    ["a segment longer than any slug", "a".repeat(41)],
    ["an empty segment", ""],
  ])(
    "answers null for %s without a query or a cache entry",
    async (_case, segment) => {
      const { findFirst } = setup({ found: { id: 7, slug: "lr-market" } });

      await expect(getStoreForPath(segment)).resolves.toBeNull();

      expect(findFirst).not.toHaveBeenCalled();
      expect(cacheTag).not.toHaveBeenCalled();
    }
  );
});

describe("invalidateStoreCache", () => {
  test("expires the store's id tag, its address tag and the default's tag at once, serving nothing stale", () => {
    invalidateStoreCache({ id: 7, slug: "lr-market" });

    expect(revalidateTag.mock.calls).toEqual([
      ["store:7", { expire: 0 }],
      ["store-slug:lr-market", { expire: 0 }],
      ["store-default", { expire: 0 }],
    ]);
  });
});
