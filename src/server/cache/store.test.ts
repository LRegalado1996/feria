import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import type { MockDatabase } from "@/server/test/context";

import { invalidateStoreCache, readStore } from "./store";

const { cacheLife, cacheTag, revalidateTag } = vi.hoisted(() => ({
  cacheLife: vi.fn<(profile: string) => void>(),
  cacheTag: vi.fn<(...tags: string[]) => void>(),
  revalidateTag: vi.fn<(tag: string, profile: unknown) => void>(),
}));

// Next's cache only exists inside a Next render. Outside it `"use cache"` is
// a plain string, so the function under test runs on every call.
vi.mock("next/cache", () => ({ cacheLife, cacheTag, revalidateTag }));

function setup({ found }: { found?: { id: number; name: string } } = {}) {
  // `@/server/db` is the passive double for every unit test (setup-common).
  const database = db as unknown as MockDatabase;
  database.query.store.findFirst.mockResolvedValue(found);

  return { findFirst: database.query.store.findFirst };
}

describe("readStore", () => {
  test("returns the store, read through the service with the app's own client, under the store's tag", async () => {
    const found = { id: 7, name: "LR Market" };
    const { findFirst } = setup({ found });

    await expect(readStore()).resolves.toBe(found);

    // The service's read: the store's row with its texts.
    expect(findFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        with: {
          translations: {
            columns: {
              description: true,
              locale: true,
              location: true,
              tagline: true,
            },
          },
        },
      })
    );
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("store");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  test("answers null before the store's row exists", async () => {
    setup();

    await expect(readStore()).resolves.toBeNull();
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("store");
  });
});

describe("invalidateStoreCache", () => {
  test("expires the store's tag at once, serving nothing stale", () => {
    invalidateStoreCache();

    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("store", {
      expire: 0,
    });
  });
});
