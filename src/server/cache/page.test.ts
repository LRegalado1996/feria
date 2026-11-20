import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

import {
  announcementTag,
  homePageTag,
  invalidateAnnouncementCache,
  invalidatePageCache,
  invalidatePagesCache,
  pagesTag,
  pageTag,
  readAnnouncement,
  readHomePageId,
  readPageContent,
} from "./page";

const {
  cacheLife,
  cacheTag,
  findHomePageId,
  findShowingAnnouncement,
  getPageContent,
  revalidateTag,
} = vi.hoisted(() => ({
  cacheLife: vi.fn<(profile: unknown) => void>(),
  cacheTag: vi.fn<(...tags: string[]) => void>(),
  findHomePageId: vi.fn<(...args: unknown[]) => Promise<number>>(),
  findShowingAnnouncement: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getPageContent: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  revalidateTag: vi.fn<(tag: string, profile: unknown) => void>(),
}));

// Next's cache only exists inside a Next render. Outside it `"use cache"` is
// a plain string, so the function under test runs on every call.
vi.mock("next/cache", () => ({ cacheLife, cacheTag, revalidateTag }));

// The service has its own tests; here only what the cache hands it counts.
vi.mock("@/server/services/page", () => ({
  findHomePageId,
  findShowingAnnouncement,
  getPageContent,
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
  const content = { cover: [], sections: [] };
  findShowingAnnouncement.mockResolvedValue(announcement);
  getPageContent.mockResolvedValue(content);
  findHomePageId.mockResolvedValue(3);

  return { announcement, content };
}

describe("tags", () => {
  test.each([
    ["the store's pages", pagesTag(7), "pages:7"],
    ["one page of the store", pageTag(7, 3), "page:7:3"],
    ["the store's choice of home", homePageTag(7), "home-page:7"],
    ["the store's announcement", announcementTag(7), "announcement:7"],
  ])("name %s", (_what, tag, expected) => {
    expect(tag).toBe(expected);
  });
});

describe("readAnnouncement", () => {
  test("reads the announcement of the business day, with the app's own client, under its own tag", async () => {
    // 01:00 UTC is still December 4 in Montevideo, two hours before its end.
    const { announcement } = setup("2026-12-05T01:00:00Z");

    await expect(readAnnouncement({ id: 7 }, "en")).resolves.toBe(announcement);

    expect(findShowingAnnouncement).toHaveBeenCalledExactlyOnceWith(db, {
      locale: "en",
      storeId: 7,
      today: "2026-12-04",
    });
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("announcement:7");
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

describe("readHomePageId", () => {
  test("reads the store's home page with the app's own client, under its own tag", async () => {
    setup("2026-12-05T03:00:00Z");

    await expect(readHomePageId({ id: 7 })).resolves.toBe(3);

    expect(findHomePageId).toHaveBeenCalledExactlyOnceWith(db, { storeId: 7 });
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith("home-page:7");
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});

describe("readPageContent", () => {
  test("reads the page of the business day in the store's currency, under its own, the store's pages' and the catalog's tags", async () => {
    const { content } = setup("2026-12-05T03:00:00Z");

    await expect(
      readPageContent({ currencyCode: "USD", id: 7 }, 3, "es")
    ).resolves.toBe(content);

    expect(getPageContent).toHaveBeenCalledExactlyOnceWith(db, {
      currencyCode: "USD",
      locale: "es",
      pageId: 3,
      storeId: 7,
      today: "2026-12-05",
    });
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(
      "page:7:3",
      "pages:7",
      "catalog:7"
    );
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
      expire: 86_400,
      revalidate: 3600,
    });
  });

  test("a minute before midnight, lives a minute", async () => {
    setup("2026-12-06T02:59:00Z");

    await readPageContent({ currencyCode: "UYU", id: 7 }, 3, "en");

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith({
      expire: 86_400,
      revalidate: 60,
    });
  });
});

describe("invalidation", () => {
  test.each([
    {
      drop: () => {
        invalidatePagesCache(7);
      },
      tag: "pages:7",
      what: "every page of the store",
    },
    {
      drop: () => {
        invalidatePageCache(7, 3);
      },
      tag: "page:7:3",
      what: "one page",
    },
    {
      drop: () => {
        invalidateAnnouncementCache(7);
      },
      tag: "announcement:7",
      what: "the announcement",
    },
  ])("drops $what at once, serving nothing stale", ({ drop, tag }) => {
    drop();

    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(tag, { expire: 0 });
  });
});
