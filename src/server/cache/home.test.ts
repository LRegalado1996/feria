import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

import {
  homeTag,
  invalidateHomeCache,
  readAnnouncement,
  readHomeContent,
} from "./home";

const {
  cacheLife,
  cacheTag,
  findShowingAnnouncement,
  getHomeContent,
  revalidateTag,
} = vi.hoisted(() => ({
  cacheLife: vi.fn<(profile: unknown) => void>(),
  cacheTag: vi.fn<(...tags: string[]) => void>(),
  findShowingAnnouncement: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getHomeContent: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  revalidateTag: vi.fn<(tag: string, profile: unknown) => void>(),
}));

// Next's cache only exists inside a Next render. Outside it `"use cache"` is
// a plain string, so the function under test runs on every call.
vi.mock("next/cache", () => ({ cacheLife, cacheTag, revalidateTag }));

// The service has its own tests; here only what the cache hands it counts.
vi.mock("@/server/services/home", () => ({
  findShowingAnnouncement,
  getHomeContent,
}));

/** The clock at `iso`, and what the service answers. */
function setup(iso: string) {
  vi.setSystemTime(new Date(iso));
  const announcement = {
    href: null,
    lang: "es",
    shortText: null,
    text: "Feria",
  };
  const content = { announcement, cover: [], sections: [] };
  findShowingAnnouncement.mockResolvedValue(announcement);
  getHomeContent.mockResolvedValue(content);

  return { announcement, content };
}

describe("homeTag", () => {
  test("names a store's home", () => {
    expect(homeTag(7)).toBe("home:7");
  });
});

describe("readAnnouncement", () => {
  test("reads the announcement of the business day, with the app's own client, under the home's tag", async () => {
    // 01:00 UTC is still December 4 in Montevideo, two hours before its end.
    const { announcement } = setup("2026-12-05T01:00:00Z");

    await expect(readAnnouncement({ id: 7 }, "en")).resolves.toBe(announcement);

    expect(findShowingAnnouncement).toHaveBeenCalledExactlyOnceWith(db, {
      locale: "en",
      storeId: 7,
      today: "2026-12-04",
    });
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("home:7");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
      expire: 86_400,
      revalidate: 3600,
    });
  });

  test("near midnight, is refreshed when the day turns", async () => {
    setup("2026-12-05T02:59:00Z");

    await readAnnouncement({ id: 7 }, "es");

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
      expire: 86_400,
      revalidate: 60,
    });
  });
});

describe("readHomeContent", () => {
  test("reads the home of the business day in the store's currency, under the home's and the catalog's tags", async () => {
    const { content } = setup("2026-12-05T03:00:00Z");

    await expect(
      readHomeContent({ currencyCode: "USD", id: 7 }, "es")
    ).resolves.toBe(content);

    expect(getHomeContent).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      locale: "es",
      storeId: 7,
      today: "2026-12-05",
    });
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("home:7", "catalog:7");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
      expire: 86_400,
      revalidate: 3600,
    });
  });

  test("a minute before midnight, lives a minute", async () => {
    setup("2026-12-06T02:59:00Z");

    await readHomeContent({ currencyCode: "UYU", id: 7 }, "en");

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
      expire: 86_400,
      revalidate: 60,
    });
  });
});

describe("invalidateHomeCache", () => {
  test("expires the store's home tag at once, serving nothing stale", () => {
    invalidateHomeCache(7);

    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("home:7", {
      expire: 0,
    });
  });
});
