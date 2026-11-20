import { describe, expect, test, vi } from "vitest";

import { createMockDatabase } from "@/server/test/context";

import {
  writeToAnnouncement,
  writeToCatalog,
  writeToPage,
  writeToPages,
  writeToStore,
} from "./write-to-store";

// The handle `withAdmin` hands its callback: distinct from the client, so a
// write handed the outer client instead would be caught.
const { TX, withAdmin } = vi.hoisted(() => {
  const handle = { handle: "the write's transaction" };

  return {
    TX: handle,
    withAdmin: vi.fn(
      async (
        _db: unknown,
        _userId: unknown,
        write: (tx: unknown) => Promise<unknown>
      ) => await write(handle)
    ),
  };
});

const {
  invalidateAnnouncementCache,
  invalidateCatalogCache,
  invalidatePageCache,
  invalidatePagesCache,
} = vi.hoisted(() => ({
  invalidateAnnouncementCache: vi.fn<(storeId: number) => void>(),
  invalidateCatalogCache: vi.fn<(storeId: number) => void>(),
  invalidatePageCache: vi.fn<(storeId: number, pageId: number) => void>(),
  invalidatePagesCache: vi.fn<(storeId: number) => void>(),
}));

vi.mock("@/server/services/access", () => ({ withAdmin }));

// Next's cache only exists inside a Next render.
vi.mock("@/server/cache/catalog", () => ({ invalidateCatalogCache }));

vi.mock("@/server/cache/page", () => ({
  invalidateAnnouncementCache,
  invalidatePageCache,
  invalidatePagesCache,
}));

function setup() {
  const db = createMockDatabase();
  const context = {
    db: db as never,
    session: { user: { id: "user-1" } },
    store: { id: 7 },
  };
  const write = vi.fn(async (_tx: unknown, storeId: number) => ({
    id: 11,
    storeId,
  }));

  return { context, db, write };
}

describe("writeToStore", () => {
  test("runs the write on the store inside the re-check of the caller's login, and answers its result", async () => {
    const { context, db, write } = setup();

    await expect(writeToStore(context, write)).resolves.toEqual({
      id: 11,
      storeId: 7,
    });

    expect(withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      "user-1",
      expect.any(Function)
    );
    expect(write).toHaveBeenCalledExactlyOnceWith(TX, 7);
  });

  test("lets a failed write reject the call", async () => {
    const { context, write } = setup();
    write.mockRejectedValueOnce(new Error("Category not found"));

    await expect(writeToStore(context, write)).rejects.toThrow(
      "Category not found"
    );
  });
});

describe("writeToCatalog", () => {
  test("writes through the login's re-check, then drops the store's cached catalog, and answers the write's result", async () => {
    const { context, db, write } = setup();

    await expect(writeToCatalog(context, write)).resolves.toEqual({
      id: 11,
      storeId: 7,
    });

    expect(withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      "user-1",
      expect.any(Function)
    );
    expect(write).toHaveBeenCalledExactlyOnceWith(TX, 7);
    expect(invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
    // Dropped once the write committed, never before it ran.
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateCatalogCache.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("keeps the cache when the write fails, and lets the failure reject the call", async () => {
    const { context, write } = setup();
    write.mockRejectedValueOnce(new Error("Product not found"));

    await expect(writeToCatalog(context, write)).rejects.toThrow(
      "Product not found"
    );
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test.each([
    ["drops", true, [[7]]],
    ["keeps", false, []],
  ])(
    "%s the cache as the committed result says it shows on the storefront",
    async (_case, shown, calls) => {
      const { context, write } = setup();
      const shows = vi.fn((_result: { id: number; storeId: number }) => shown);

      await expect(writeToCatalog(context, write, shows)).resolves.toEqual({
        id: 11,
        storeId: 7,
      });

      // Asked about what the write committed, not before it ran.
      expect(shows).toHaveBeenCalledExactlyOnceWith({ id: 11, storeId: 7 });
      expect(invalidateCatalogCache.mock.calls).toEqual(calls);
    }
  );
});

describe("writeToPages", () => {
  test("writes through the login's re-check, then drops every cached page of the store, and answers the write's result", async () => {
    const { context, db, write } = setup();

    await expect(writeToPages(context, write)).resolves.toEqual({
      id: 11,
      storeId: 7,
    });

    expect(withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      "user-1",
      expect.any(Function)
    );
    expect(write).toHaveBeenCalledExactlyOnceWith(TX, 7);
    expect(invalidatePagesCache).toHaveBeenCalledExactlyOnceWith(7);
    // Dropped once the write committed, never before it ran.
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(
      invalidatePagesCache.mock.invocationCallOrder[0] ?? 0
    );
    // The catalog is not the pages': its cache stays.
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("keeps the cache when the write fails, and lets the failure reject the call", async () => {
    const { context, write } = setup();
    write.mockRejectedValueOnce(new Error("Banner not found"));

    await expect(writeToPages(context, write)).rejects.toThrow(
      "Banner not found"
    );
    expect(invalidatePagesCache).not.toHaveBeenCalled();
  });
});

describe("writeToPage", () => {
  test.each([
    ["only that page", false, [], [[7, 3]]],
    [
      "that page and every page, the curated lists having changed",
      true,
      [[7]],
      [[7, 3]],
    ],
  ])(
    "writes through the login's re-check, then drops %s",
    async (_case, curatedChanged, pages, page) => {
      const { context, db } = setup();
      const write = vi.fn(async (_tx: unknown, storeId: number) => ({
        curatedChanged,
        storeId,
      }));

      await expect(writeToPage(context, 3, write)).resolves.toEqual({
        curatedChanged,
        storeId: 7,
      });

      expect(withAdmin).toHaveBeenCalledExactlyOnceWith(
        db,
        "user-1",
        expect.any(Function)
      );
      expect(write).toHaveBeenCalledExactlyOnceWith(TX, 7);
      expect(invalidatePageCache.mock.calls).toEqual(page);
      expect(invalidatePagesCache.mock.calls).toEqual(pages);
      expect(write.mock.invocationCallOrder[0]).toBeLessThan(
        invalidatePageCache.mock.invocationCallOrder[0] ?? 0
      );
    }
  );

  test("keeps the cache when the write fails, and lets the failure reject the call", async () => {
    const { context } = setup();
    const write = vi.fn(async (): Promise<{ curatedChanged: boolean }> => {
      throw new Error("Page not found");
    });

    await expect(writeToPage(context, 3, write)).rejects.toThrow(
      "Page not found"
    );
    expect(invalidatePageCache).not.toHaveBeenCalled();
    expect(invalidatePagesCache).not.toHaveBeenCalled();
  });
});

describe("writeToAnnouncement", () => {
  test("writes through the login's re-check, then drops the cached bar only", async () => {
    const { context, write } = setup();

    await expect(writeToAnnouncement(context, write)).resolves.toEqual({
      id: 11,
      storeId: 7,
    });

    expect(write).toHaveBeenCalledExactlyOnceWith(TX, 7);
    expect(invalidateAnnouncementCache).toHaveBeenCalledExactlyOnceWith(7);
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateAnnouncementCache.mock.invocationCallOrder[0] ?? 0
    );
    expect(invalidatePagesCache).not.toHaveBeenCalled();
  });

  test("keeps the cache when the write fails", async () => {
    const { context, write } = setup();
    write.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(writeToAnnouncement(context, write)).rejects.toThrow(
      "Unauthorized"
    );
    expect(invalidateAnnouncementCache).not.toHaveBeenCalled();
  });
});
