import { describe, expect, test, vi } from "vitest";

import { store, user } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { findAdminStore, hasLogin, withAdmin } from "./access";

function setup() {
  const db = createMockDatabase();

  return {
    db,
    /** What the service handed the relational read of `user`. */
    userRead: () => {
      const [config] = db.query.user.findFirst.mock.calls[0] ?? [];
      return config as { columns: unknown; where?: unknown };
    },
  };
}

describe("findAdminStore", () => {
  test("re-reads the login by its id, then answers the store's one row", async () => {
    const { db, userRead } = setup();
    db.query.user.findFirst.mockResolvedValue({ id: "user-1" });
    db.$["select.limit"].mockResolvedValue([{ id: 3 }]);

    await expect(findAdminStore(db as never, "user-1")).resolves.toEqual({
      id: 3,
    });

    expect(userRead().columns).toEqual({ id: true });
    expect(renderQuery(userRead().where)).toEqual({
      params: ["user-1"],
      sql: '"user"."id" = $1',
    });
    expect(db.$.select).toHaveBeenCalledExactlyOnceWith({ id: store.id });
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(store);
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(1);
  });

  test("answers null for a login the database no longer has, without reading the store", async () => {
    const { db } = setup();

    await expect(findAdminStore(db as never, "gone")).resolves.toBeNull();
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("answers NOT_FOUND when the store's row does not exist", async () => {
    const { db } = setup();
    db.query.user.findFirst.mockResolvedValue({ id: "user-1" });

    await expect(findAdminStore(db as never, "user-1")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });
});

describe("hasLogin", () => {
  test.each([
    [true, { id: "first-login" }],
    [false, undefined],
  ])("is %s when the read of any login finds %j", async (expected, row) => {
    const { db, userRead } = setup();
    db.query.user.findFirst.mockResolvedValue(row);

    await expect(hasLogin(db as never)).resolves.toBe(expected);
    // Any login at all: no condition on who it is.
    expect(userRead()).toEqual({ columns: { id: true } });
  });
});

describe("withAdmin", () => {
  /** A database whose transaction hands its callback a handle of its own. */
  function setupLocked({ isLogin }: { isLogin: boolean }) {
    const { db } = setup();
    const tx = createMockDatabase();
    db.$.transaction.mockImplementation(
      async (callback: unknown) =>
        await (callback as (handle: unknown) => Promise<unknown>)(tx)
    );
    tx.$["select.for"].mockResolvedValue(isLogin ? [{ id: "user-1" }] : []);
    const write = vi.fn(async (_tx: unknown) => "written");

    return {
      db,
      tx,
      write,
      run: async () => await withAdmin(db as never, "user-1", write),
    };
  }

  test("writes after locking the caller's own user row FOR SHARE, all in one transaction", async () => {
    const { db, run, tx, write } = setupLocked({ isLogin: true });

    await expect(run()).resolves.toBe("written");

    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
    expect(tx.$["select.from"]).toHaveBeenCalledExactlyOnceWith(user);
    expect(renderQuery(tx.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: ["user-1"],
      sql: '"user"."id" = $1',
    });
    expect(tx.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(write).toHaveBeenCalledExactlyOnceWith(tx);
    expect(tx.$["select.for"].mock.invocationCallOrder[0]).toBeLessThan(
      write.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("answers UNAUTHORIZED to a login that no longer exists, writing nothing", async () => {
    const { run, write } = setupLocked({ isLogin: false });

    await expect(run()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(write).not.toHaveBeenCalled();
  });

  test("lets a failed write reject the call", async () => {
    const { run, write } = setupLocked({ isLogin: true });
    write.mockRejectedValueOnce(new Error("Category not found"));

    await expect(run()).rejects.toThrow("Category not found");
  });
});
