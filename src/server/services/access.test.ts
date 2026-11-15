import { describe, expect, test, vi } from "vitest";

import { store, storeMember, user } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  addStoreMember,
  findAccessibleStore,
  getAdminProfile,
  getUserRole,
  hasSuperadmin,
  listAccessibleStores,
  listStoreIdsBySlug,
  setUserRole,
  withStoreAccess,
} from "./access";

function setup() {
  const db = createMockDatabase();

  return {
    db,
    /** The `where` the service handed a relational read, as SQL. */
    whereOf: (model: "user") => {
      const [config] = db.query[model].findFirst.mock.calls[0] ?? [];
      return renderQuery((config as { where: unknown }).where);
    },
  };
}

describe("getUserRole", () => {
  test.each(["superadmin", "member"] as const)(
    "answers the %s role the database holds for that user",
    async (role) => {
      const { db, whereOf } = setup();
      db.query.user.findFirst.mockResolvedValue({ role });

      await expect(getUserRole(db as never, "user-1")).resolves.toBe(role);
      expect(whereOf("user")).toEqual({
        params: ["user-1"],
        sql: '"user"."id" = $1',
      });
    }
  );

  test("answers null for a user that no longer exists", async () => {
    const { db } = setup();

    await expect(getUserRole(db as never, "gone")).resolves.toBeNull();
  });
});

describe("findAccessibleStore", () => {
  test("filters by the slug and by the caller's access in the same query", async () => {
    const { db } = setup();
    const found = { id: 3, slug: "lr-market" };
    db.$["select.limit"].mockResolvedValue([found]);

    await expect(
      findAccessibleStore(db as never, { slug: "lr-market", userId: "user-1" })
    ).resolves.toBe(found);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(store);
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(1);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: ["lr-market", "user-1", "superadmin", "user-1"],
      sql:
        '("store"."slug" = $1 and (exists (select 1 from "user" where ("user"."id" = $2 and "user"."role" = $3)) or ' +
        'exists (select 1 from "store_member" where ("store_member"."storeId" = "store"."id" and "store_member"."userId" = $4))))',
    });
  });

  test("answers null when no store matches, whether missing or not the caller's", async () => {
    const { db } = setup();

    await expect(
      findAccessibleStore(db as never, { slug: "tienda-demo", userId: "u" })
    ).resolves.toBeNull();
  });
});

describe("hasSuperadmin", () => {
  test.each([
    [true, { id: "admin-1" }],
    [false, undefined],
  ])(
    "is %s when the query for a superadmin finds %j",
    async (expected, row) => {
      const { db, whereOf } = setup();
      db.query.user.findFirst.mockResolvedValue(row);

      await expect(hasSuperadmin(db as never)).resolves.toBe(expected);
      expect(whereOf("user")).toEqual({
        params: ["superadmin"],
        sql: '"user"."role" = $1',
      });
    }
  );
});

describe("addStoreMember", () => {
  test("inserts the pair and leaves an existing membership alone", async () => {
    const { db } = setup();

    await addStoreMember(db as never, { storeId: 3, userId: "user-1" });

    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(storeMember);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      storeId: 3,
      userId: "user-1",
    });
    expect(db.$["insert.onConflictDoNothing"]).toHaveBeenCalledExactlyOnceWith({
      target: [storeMember.storeId, storeMember.userId],
    });
  });
});

describe("setUserRole", () => {
  test("sets the role on that user only", async () => {
    const { db } = setup();
    db.$["update.returning"].mockResolvedValue([{ id: "user-1" }]);

    await setUserRole(db as never, { role: "superadmin", userId: "user-1" });

    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(user);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      role: "superadmin",
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: ["user-1"],
      sql: '"user"."id" = $1',
    });
  });

  test("answers NOT_FOUND when no user has that id", async () => {
    const { db } = setup();
    db.$["update.returning"].mockResolvedValue([]);

    await expect(
      setUserRole(db as never, { role: "member", userId: "gone" })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "User not found" });
  });
});

describe("listStoreIdsBySlug", () => {
  test("maps each slug found to its id, in one query", async () => {
    const { db } = setup();
    db.query.store.findMany.mockResolvedValue([{ id: 11, slug: "lr-market" }]);

    const ids = await listStoreIdsBySlug(db as never, ["lr-market", "gone"]);

    expect([...ids]).toEqual([["lr-market", 11]]);
    const [config] = db.query.store.findMany.mock.calls[0] ?? [];
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: ["lr-market", "gone"],
      sql: '"store"."slug" in ($1, $2)',
    });
  });

  test("asks nothing for no slugs", async () => {
    const { db } = setup();

    await expect(listStoreIdsBySlug(db as never, [])).resolves.toEqual(
      new Map()
    );
    expect(db.query.store.findMany).not.toHaveBeenCalled();
  });
});

describe("withStoreAccess", () => {
  /** The double's answers to the two locked reads, in the order they run. */
  function setupLocked({
    member = false,
    superadmin = false,
  }: {
    member?: boolean;
    superadmin?: boolean;
  }) {
    const { db } = setup();
    db.$["select.for"]
      .mockResolvedValueOnce(superadmin ? [{ id: "user-1" }] : [])
      .mockResolvedValueOnce(member ? [{ id: 9 }] : []);
    const write = vi.fn(async (_tx: unknown) => "written");

    return {
      db,
      write,
      run: async (storeId: number | null) =>
        await withStoreAccess(
          db as never,
          { storeId, userId: "user-1" },
          write
        ),
    };
  }

  test("writes for a superadmin after locking their row, on any store or none", async () => {
    const { db, run, write } = setupLocked({ superadmin: true });

    await expect(run(null)).resolves.toBe("written");
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: ["user-1", "superadmin"],
      sql: '("user"."id" = $1 and "user"."role" = $2)',
    });
    expect(write).toHaveBeenCalledExactlyOnceWith(db);
  });

  test("writes for a member of the store after locking the membership", async () => {
    const { db, run, write } = setupLocked({ member: true });

    await expect(run(3)).resolves.toBe("written");
    expect(db.$["select.for"].mock.calls).toEqual([["share"], ["share"]]);
    expect(renderQuery(db.$["select.where"].mock.calls[1]?.[0])).toEqual({
      params: [3, "user-1"],
      sql: '("store_member"."storeId" = $1 and "store_member"."userId" = $2)',
    });
    expect(write).toHaveBeenCalledExactlyOnceWith(db);
  });

  test("answers NOT_FOUND to a login that is no member of the store, writing nothing", async () => {
    const { run, write } = setupLocked({});

    await expect(run(3)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
    expect(write).not.toHaveBeenCalled();
  });

  test("answers FORBIDDEN to a non-superadmin for a platform write, writing nothing", async () => {
    const { db, run, write } = setupLocked({ member: true });

    await expect(run(null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(write).not.toHaveBeenCalled();
  });
});

describe("listAccessibleStores", () => {
  test("lists the stores the caller may work on, by name then id, in one query", async () => {
    const { db } = setup();
    const rows = [
      { id: 3, isActive: true, name: "LR Market", slug: "lr-market" },
    ];
    db.$["select.orderBy"].mockResolvedValue(rows);

    await expect(listAccessibleStores(db as never, "user-1")).resolves.toBe(
      rows
    );
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(store);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: ["user-1", "superadmin", "user-1"],
      sql:
        '(exists (select 1 from "user" where ("user"."id" = $1 and "user"."role" = $2)) or ' +
        'exists (select 1 from "store_member" where ("store_member"."storeId" = "store"."id" and "store_member"."userId" = $3)))',
    });
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"store"."name" asc, "store"."id" asc'
    );
  });
});

describe("getAdminProfile", () => {
  test("reads both in one read-only, repeatable-read transaction", async () => {
    const { db } = setup();
    db.query.user.findFirst.mockResolvedValue({ role: "member" });
    db.$["select.orderBy"].mockResolvedValue([]);

    await getAdminProfile(db as never, "user-1");

    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { accessMode: "read only", isolationLevel: "repeatable read" }
    );
  });

  test("answers the role and the stores together", async () => {
    const { db } = setup();
    const stores = [
      { id: 3, isActive: true, name: "LR Market", slug: "lr-market" },
    ];
    db.query.user.findFirst.mockResolvedValue({ role: "member" });
    db.$["select.orderBy"].mockResolvedValue(stores);

    await expect(getAdminProfile(db as never, "user-1")).resolves.toEqual({
      role: "member",
      stores,
    });
  });

  test("answers null for a user that no longer exists", async () => {
    const { db } = setup();
    db.$["select.orderBy"].mockResolvedValue([]);

    await expect(getAdminProfile(db as never, "gone")).resolves.toBeNull();
  });
});
