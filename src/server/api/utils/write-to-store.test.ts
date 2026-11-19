import { describe, expect, test, vi } from "vitest";

import { createMockDatabase } from "@/server/test/context";

import { writeToCatalog, writeToHome, writeToStore } from "./write-to-store";

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

const { invalidateCatalogCache, invalidateHomeCache } = vi.hoisted(() => ({
  invalidateCatalogCache: vi.fn<(storeId: number) => void>(),
  invalidateHomeCache: vi.fn<(storeId: number) => void>(),
}));

vi.mock("@/server/services/access", () => ({ withAdmin }));

// Next's cache only exists inside a Next render.
vi.mock("@/server/cache/catalog", () => ({ invalidateCatalogCache }));

vi.mock("@/server/cache/home", () => ({ invalidateHomeCache }));

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

describe("writeToHome", () => {
  test("writes through the login's re-check, then drops the store's cached home, and answers the write's result", async () => {
    const { context, db, write } = setup();

    await expect(writeToHome(context, write)).resolves.toEqual({
      id: 11,
      storeId: 7,
    });

    expect(withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      "user-1",
      expect.any(Function)
    );
    expect(write).toHaveBeenCalledExactlyOnceWith(TX, 7);
    expect(invalidateHomeCache).toHaveBeenCalledExactlyOnceWith(7);
    // Dropped once the write committed, never before it ran.
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateHomeCache.mock.invocationCallOrder[0] ?? 0
    );
    // The catalog is not the home's: its cache stays.
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("keeps the cache when the write fails, and lets the failure reject the call", async () => {
    const { context, write } = setup();
    write.mockRejectedValueOnce(new Error("Banner not found"));

    await expect(writeToHome(context, write)).rejects.toThrow(
      "Banner not found"
    );
    expect(invalidateHomeCache).not.toHaveBeenCalled();
  });
});
