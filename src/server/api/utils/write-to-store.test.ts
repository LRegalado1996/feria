import { describe, expect, test, vi } from "vitest";

import { createMockDatabase } from "@/server/test/context";

import { writeToStore } from "./write-to-store";

// The handle `withStoreAccess` hands its callback: distinct from the client,
// so a write handed the outer client instead would be caught.
const { TX, withStoreAccess } = vi.hoisted(() => {
  const handle = { handle: "the write's transaction" };

  return {
    TX: handle,
    withStoreAccess: vi.fn(
      async (
        _db: unknown,
        _scope: unknown,
        write: (tx: unknown) => Promise<unknown>
      ) => await write(handle)
    ),
  };
});

vi.mock("@/server/services/access", () => ({ withStoreAccess }));

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
  test("runs the write on the resolved store inside the caller's access check, and answers its result", async () => {
    const { context, db, write } = setup();

    await expect(writeToStore(context, write)).resolves.toEqual({
      id: 11,
      storeId: 7,
    });

    expect(withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      { storeId: 7, userId: "user-1" },
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
