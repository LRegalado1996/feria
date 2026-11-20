import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import type { MockDatabase } from "@/server/test/context";

import { invalidateComingSoonCache, readComingSoon } from "./coming-soon";

const { cacheLife, cacheTag, revalidateTag } = vi.hoisted(() => ({
  cacheLife: vi.fn<(profile: string) => void>(),
  cacheTag: vi.fn<(...tags: string[]) => void>(),
  revalidateTag: vi.fn<(tag: string, profile: unknown) => void>(),
}));

// Next's cache only exists inside a Next render. Outside it `"use cache"` is
// a plain string, so the function under test runs on every call.
vi.mock("next/cache", () => ({ cacheLife, cacheTag, revalidateTag }));

function setup({ found }: { found?: unknown } = {}) {
  // `@/server/db` is the passive double for every unit test (setup-common).
  const database = db as unknown as MockDatabase;
  database.query.comingSoon.findFirst.mockResolvedValue(found);

  return { findFirst: database.query.comingSoon.findFirst };
}

describe("readComingSoon", () => {
  test("returns the saved page, read through the service with the app's own client, under its tag", async () => {
    const found = {
      countdownTo: "2026-12-20",
      published: false,
      translations: [
        {
          eyebrow: null,
          headline: "Abrimos",
          lead: null,
          locale: "es",
          marquee: null,
        },
      ],
    };
    const { findFirst } = setup({ found });

    await expect(readComingSoon()).resolves.toBe(found);
    expect(findFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        columns: { countdownTo: true, published: true },
      })
    );
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("coming-soon");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  test("before anyone saved it, it is the published page with the dictionary's texts", async () => {
    setup();

    await expect(readComingSoon()).resolves.toEqual({
      countdownTo: null,
      published: true,
      translations: [],
    });
  });
});

describe("invalidateComingSoonCache", () => {
  test("expires the page's tag at once, serving nothing stale", () => {
    invalidateComingSoonCache();

    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("coming-soon", {
      expire: 0,
    });
  });
});
