import { describe, expect, test, vi } from "vitest";

import { PASSWORD_ATTEMPTS } from "@/lib/schemas/access";
import type { AccountAuth } from "@/server/better-auth/accounts";
import { account, rateLimit, session, user } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";
import { deferred } from "@/server/test/two-writers";

import {
  changeOwnPassword,
  disableLogin,
  enableLogin,
  listLogins,
  resetLoginPassword,
} from "./user";

const DISABLED_AT = new Date("2026-11-20T12:00:00.000Z");

/** A row as `lockLogins` reads it. */
function makeLocked(
  id: string,
  overrides: {
    disabledAt?: Date | null;
    mustChangePassword?: boolean;
    role?: "member" | "superadmin";
  } = {}
) {
  return {
    disabledAt: null,
    id,
    mustChangePassword: false,
    role: "member",
    ...overrides,
  };
}

/**
 * A database whose transaction hands its callback a handle of its own, the
 * rows its lock finds, and Better Auth's hasher and verifier.
 */
function setup({
  attempts = null,
  credential = { id: "account-b", password: "hashed:old-password" },
  locked = [makeLocked("admin-a"), makeLocked("admin-b")],
  updated = [{ id: "account-b" }],
}: {
  /** The login's wrong tries so far, when it has any (`changeOwnPassword`). */
  attempts?: { count: number; lastRequest: number } | null;
  credential?: { id: string; password: string | null } | null;
  locked?: ReturnType<typeof makeLocked>[];
  updated?: { id: string }[];
} = {}) {
  const db = createMockDatabase();
  const tx = createMockDatabase();
  db.$.transaction.mockImplementation(
    async (callback: unknown) =>
      await (callback as (handle: unknown) => Promise<unknown>)(tx)
  );
  // Each locked read answers by the table it reads, never by its turn: a
  // read of anything else is a query the service should not make.
  tx.$["select.for"].mockImplementation(async () => {
    const [table] = tx.$["select.from"].mock.lastCall ?? [];

    if (table === user) {
      return locked;
    }

    if (table === rateLimit) {
      return attempts ? [attempts] : [];
    }

    if (table === account) {
      return credential ? [credential] : [];
    }

    throw new Error("A locked read of a table the test does not expect");
  });
  tx.$["update.returning"].mockResolvedValue(updated);
  const hash = vi.fn(async (password: string) => `hashed:${password}`);
  const verify = vi.fn(
    async ({ hash: stored, password }: { hash: string; password: string }) =>
      stored === `hashed:${password}`
  );
  const auth = {
    $context: Promise.resolve({ password: { hash, verify } }),
  } as unknown as AccountAuth;

  return {
    auth,
    db,
    hash,
    tx,
    verify,
    /** The SQL of the `n`th lock's condition, and its order. */
    lock: (n = 0) => ({
      orderBy: renderOrderBy(tx.$["select.orderBy"].mock.calls[n]?.[0]),
      where: renderQuery(tx.$["select.where"].mock.calls[n]?.[0]),
    }),
  };
}

describe("listLogins", () => {
  test("reads every login's public fields, the oldest first with the id as the tiebreak", async () => {
    const { db } = setup();
    const rows = [
      {
        createdAt: new Date("2026-11-01T10:00:00.000Z"),
        disabledAt: null,
        email: "ana@example.test",
        id: "admin-a",
        mustChangePassword: false,
        name: "Ana",
      },
    ];
    db.$["select.orderBy"].mockResolvedValue(rows);

    await expect(listLogins(db as never)).resolves.toEqual(rows);
    expect(db.$.select).toHaveBeenCalledExactlyOnceWith({
      createdAt: user.createdAt,
      disabledAt: user.disabledAt,
      email: user.email,
      id: user.id,
      mustChangePassword: user.mustChangePassword,
      name: user.name,
      role: user.role,
    });
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(user);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"user"."createdAt" asc, "user"."id" asc'
    );
  });
});

describe("disableLogin", () => {
  test("locks every enabled login and the target by id, stamps the database's clock and ends the target's sessions", async () => {
    const { db, lock, tx } = setup();
    tx.$["update.returning"].mockResolvedValue([
      { disabledAt: DISABLED_AT, id: "admin-b" },
    ]);

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).resolves.toEqual({ disabledAt: DISABLED_AT, id: "admin-b" });

    expect(lock()).toEqual({
      orderBy: '"user"."id" asc',
      where: {
        params: ["admin-b"],
        sql: '("user"."disabledAt" is null or "user"."id" = $1)',
      },
    });
    expect(tx.$["select.for"]).toHaveBeenNthCalledWith(1, "update");
    expect(tx.$.update).toHaveBeenCalledExactlyOnceWith(user);
    const [set] = tx.$["update.set"].mock.calls[0] ?? [];
    expect(renderQuery((set as { disabledAt: unknown }).disabledAt)).toEqual({
      params: [],
      sql: "clock_timestamp()",
    });
    expect(renderQuery(tx.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: ["admin-b"],
      sql: '"user"."id" = $1',
    });
    expect(tx.$.delete).toHaveBeenCalledExactlyOnceWith(session);
    expect(renderQuery(tx.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: ["admin-b"],
      sql: '"session"."userId" = $1',
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses to disable the caller's own login with FORBIDDEN, before opening a transaction", async () => {
    const { db } = setup();

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-a" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot disable your own login",
    });
    expect(db.$.transaction).not.toHaveBeenCalled();
  });

  test("refuses to disable the last enabled login with CONFLICT, changing nothing", async () => {
    // Another admin disabled the caller while this request waited on the
    // lock: the target is the one enabled login left.
    const { db, tx } = setup({
      locked: [makeLocked("admin-b")],
    });

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "The last enabled login cannot be disabled",
    });
    expect(tx.$.update).not.toHaveBeenCalled();
    expect(tx.$.delete).not.toHaveBeenCalled();
  });

  test("disables the target when exactly one other login stays enabled", async () => {
    const { db, tx } = setup({
      locked: [makeLocked("admin-a"), makeLocked("admin-b")],
    });
    tx.$["update.returning"].mockResolvedValue([
      { disabledAt: DISABLED_AT, id: "admin-b" },
    ]);

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).resolves.toEqual({ disabledAt: DISABLED_AT, id: "admin-b" });
  });

  test.each([
    [
      "a caller the lock did not find",
      [makeLocked("admin-b"), makeLocked("admin-c")],
    ],
    [
      "a caller still on a temporary password",
      [
        makeLocked("admin-a", { mustChangePassword: true }),
        makeLocked("admin-b"),
      ],
    ],
  ])("answers UNAUTHORIZED to %s, changing nothing", async (_case, locked) => {
    const { db, tx } = setup({ locked });

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" });
    expect(tx.$.update).not.toHaveBeenCalled();
    expect(tx.$.delete).not.toHaveBeenCalled();
  });

  test("answers NOT_FOUND for a target that is no login", async () => {
    const { db, tx } = setup({ locked: [makeLocked("admin-a")] });

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "gone" })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Login not found" });
    expect(tx.$.update).not.toHaveBeenCalled();
  });

  test("answers NOT_FOUND when the update finds no row, ending no session", async () => {
    const { db, tx } = setup();
    tx.$["update.returning"].mockResolvedValue([]);

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Login not found" });
    expect(tx.$.delete).not.toHaveBeenCalled();
  });

  test("keeps the date of a login already disabled, writing nothing", async () => {
    const { db, tx } = setup({
      locked: [
        makeLocked("admin-a"),
        makeLocked("admin-b", { disabledAt: DISABLED_AT }),
      ],
    });

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).resolves.toEqual({ disabledAt: DISABLED_AT, id: "admin-b" });
    expect(tx.$.update).not.toHaveBeenCalled();
    expect(tx.$.delete).not.toHaveBeenCalled();
  });

  test("still refuses a caller that is no longer enabled when the target was already disabled", async () => {
    const { db } = setup({
      locked: [makeLocked("admin-b", { disabledAt: DISABLED_AT })],
    });

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" });
  });
});

describe("enableLogin", () => {
  test("locks the caller and the target by id, then clears the target's date", async () => {
    const { db, lock, tx } = setup({
      locked: [
        makeLocked("admin-a"),
        makeLocked("admin-b", { disabledAt: DISABLED_AT }),
      ],
    });

    await expect(
      enableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).resolves.toEqual({ disabledAt: null, id: "admin-b" });

    expect(lock()).toEqual({
      orderBy: '"user"."id" asc',
      where: {
        params: ["admin-a", "admin-b"],
        sql: '"user"."id" in ($1, $2)',
      },
    });
    expect(tx.$["select.for"]).toHaveBeenCalledExactlyOnceWith("update");
    expect(tx.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      disabledAt: null,
    });
    expect(renderQuery(tx.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: ["admin-b"],
      sql: '"user"."id" = $1',
    });
  });

  test("leaves an enabled login as it is", async () => {
    const { db, tx } = setup();

    await expect(
      enableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).resolves.toEqual({ disabledAt: null, id: "admin-b" });
    expect(tx.$.update).not.toHaveBeenCalled();
  });

  test.each([
    ["a disabled caller", [makeLocked("admin-a", { disabledAt: DISABLED_AT })]],
    ["a caller the lock did not find", []],
  ])("answers UNAUTHORIZED to %s", async (_case, locked) => {
    const { db, tx } = setup({ locked });

    await expect(
      enableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" });
    expect(tx.$.update).not.toHaveBeenCalled();
  });

  test("answers NOT_FOUND for a target that is no login", async () => {
    const { db } = setup({ locked: [makeLocked("admin-a")] });

    await expect(
      enableLogin(db as never, { actorId: "admin-a", targetId: "gone" })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Login not found" });
  });
});

describe("resetLoginPassword", () => {
  test("hashes before the locks, replaces the credential, marks the login and ends its sessions", async () => {
    const { auth, db, hash, lock, tx } = setup();

    await expect(
      resetLoginPassword(auth, db as never, {
        actorId: "admin-a",
        password: "temporary-123",
        targetId: "admin-b",
      })
    ).resolves.toEqual({ id: "admin-b", mustChangePassword: true });

    expect(hash).toHaveBeenCalledExactlyOnceWith("temporary-123");
    expect(hash.mock.invocationCallOrder[0]).toBeLessThan(
      db.$.transaction.mock.invocationCallOrder[0] ?? 0
    );
    expect(lock().where).toEqual({
      params: ["admin-a", "admin-b"],
      sql: '"user"."id" in ($1, $2)',
    });
    expect(tx.$.update.mock.calls).toEqual([[account], [user]]);
    expect(tx.$["update.set"].mock.calls).toEqual([
      [{ password: "hashed:temporary-123" }],
      [{ mustChangePassword: true }],
    ]);
    expect(
      tx.$["update.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: ["admin-b", "credential"],
        sql: '("account"."userId" = $1 and "account"."providerId" = $2)',
      },
      { params: ["admin-b"], sql: '"user"."id" = $1' },
    ]);
    expect(tx.$.delete).toHaveBeenCalledExactlyOnceWith(session);
    expect(renderQuery(tx.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: ["admin-b"],
      sql: '"session"."userId" = $1',
    });
  });

  test("refuses to reset the caller's own password with FORBIDDEN, hashing nothing", async () => {
    const { auth, db, hash } = setup();

    await expect(
      resetLoginPassword(auth, db as never, {
        actorId: "admin-a",
        password: "temporary-123",
        targetId: "admin-a",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Change your own password instead of resetting it",
    });
    expect(hash).not.toHaveBeenCalled();
    expect(db.$.transaction).not.toHaveBeenCalled();
  });

  test("answers UNAUTHORIZED to a caller that is no longer enabled", async () => {
    const { auth, db, tx } = setup({
      locked: [
        makeLocked("admin-a", { disabledAt: DISABLED_AT }),
        makeLocked("admin-b"),
      ],
    });

    await expect(
      resetLoginPassword(auth, db as never, {
        actorId: "admin-a",
        password: "temporary-123",
        targetId: "admin-b",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" });
    expect(tx.$.update).not.toHaveBeenCalled();
  });

  test.each([
    ["a target that is no login", [makeLocked("admin-a")], [{ id: "x" }]],
    [
      "a login without a password",
      [makeLocked("admin-a"), makeLocked("admin-b")],
      [],
    ],
  ])(
    "answers NOT_FOUND for %s, ending no session",
    async (_case, locked, updated) => {
      const { auth, db, tx } = setup({ locked, updated });

      await expect(
        resetLoginPassword(auth, db as never, {
          actorId: "admin-a",
          password: "temporary-123",
          targetId: "admin-b",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Login not found",
      });
      expect(tx.$.delete).not.toHaveBeenCalled();
    }
  );
});

describe("changeOwnPassword", () => {
  const NOW = new Date("2026-11-25T12:00:00.000Z");
  const WINDOW = PASSWORD_ATTEMPTS.windowMs;
  const KEY = "change-password:admin-b";
  const VALUES = {
    currentPassword: "old-password",
    newPassword: "new-password-1",
    sessionId: "session-here",
    userId: "admin-b",
  };
  const WRONG = { ...VALUES, currentPassword: "not-it" };

  /** `setup()` for the login changing its own password, the clock frozen. */
  function setupChange(options: Parameters<typeof setup>[0] = {}) {
    vi.setSystemTime(NOW);
    const context = setup({ locked: [makeLocked("admin-b")], ...options });

    return {
      ...context,
      change: async (values = VALUES) =>
        await changeOwnPassword(context.auth, context.db as never, values),
    };
  }

  test("locks the login, its count and its credential, checks the current password, saves the new one, ends the other sessions and clears the count", async () => {
    const { change, hash, lock, tx, verify } = setupChange({
      locked: [makeLocked("admin-b", { mustChangePassword: true })],
    });

    await expect(change()).resolves.toEqual({
      id: "admin-b",
      mustChangePassword: false,
    });

    expect(lock(0).where).toEqual({
      params: ["admin-b"],
      sql: '("user"."id" = $1 and "user"."disabledAt" is null)',
    });
    expect(tx.$["select.from"].mock.calls).toEqual([
      [user],
      [rateLimit],
      [account],
    ]);
    expect(
      tx.$["select.where"].mock.calls
        .slice(1)
        .map(([where]) => renderQuery(where))
    ).toEqual([
      { params: [KEY], sql: '"rate_limit"."key" = $1' },
      {
        params: ["admin-b", "credential"],
        sql: '("account"."userId" = $1 and "account"."providerId" = $2)',
      },
    ]);
    expect(tx.$["select.for"].mock.calls).toEqual([
      ["update"],
      ["update"],
      ["update"],
    ]);
    expect(verify).toHaveBeenCalledExactlyOnceWith({
      hash: "hashed:old-password",
      password: "old-password",
    });
    expect(hash).toHaveBeenCalledExactlyOnceWith("new-password-1");
    expect(tx.$["update.set"].mock.calls).toEqual([
      [{ password: "hashed:new-password-1" }],
      [{ mustChangePassword: false }],
    ]);
    expect(
      tx.$["update.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      { params: ["account-b"], sql: '"account"."id" = $1' },
      { params: ["admin-b"], sql: '"user"."id" = $1' },
    ]);
    expect(tx.$.delete.mock.calls).toEqual([[session], [rateLimit]]);
    expect(
      tx.$["delete.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: ["admin-b", "session-here"],
        sql: '("session"."userId" = $1 and "session"."id" <> $2)',
      },
      { params: [KEY], sql: '"rate_limit"."key" = $1' },
    ]);
  });

  test("finishes the slow hash before it takes any lock", async () => {
    const { change, db, hash } = setupChange();
    const held = deferred<string>();
    hash.mockImplementationOnce(async () => await held.promise);

    const changing = change();
    await vi.waitFor(() => {
      expect(hash).toHaveBeenCalledExactlyOnceWith("new-password-1");
    });
    expect(db.$.transaction).not.toHaveBeenCalled();

    held.resolve("hashed:new-password-1");
    await expect(changing).resolves.toEqual({
      id: "admin-b",
      mustChangePassword: false,
    });
    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
  });

  test.each([
    ["a wrong current password", { id: "account-b", password: "hashed:other" }],
    ["a login without a password", { id: "account-b", password: null }],
    ["a login without a credential", null],
  ])(
    "refuses %s with BAD_REQUEST, saving nothing but the first wrong try",
    async (_case, credential) => {
      const { change, tx } = setupChange({ credential });

      await expect(change()).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "The current password is not correct",
      });
      expect(tx.$.update).not.toHaveBeenCalled();
      expect(tx.$.delete).not.toHaveBeenCalled();
      expect(tx.$.insert).toHaveBeenCalledExactlyOnceWith(rateLimit);
      expect(tx.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
        count: 1,
        id: expect.any(String),
        key: KEY,
        lastRequest: NOW.getTime(),
      });
      expect(tx.$["insert.onConflictDoUpdate"]).toHaveBeenCalledExactlyOnceWith(
        {
          set: { count: 1, lastRequest: NOW.getTime() },
          target: rateLimit.key,
        }
      );
    }
  );

  test.each([
    ["one millisecond inside the window", WINDOW - 1, 4],
    ["at the window's end", WINDOW, 1],
  ])(
    "a wrong try %s after the last one counts %i",
    async (_case, sinceLast, count) => {
      const { change, tx } = setupChange({
        attempts: { count: 3, lastRequest: NOW.getTime() - sinceLast },
      });

      await expect(change(WRONG)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(tx.$["insert.onConflictDoUpdate"]).toHaveBeenCalledExactlyOnceWith(
        {
          set: { count, lastRequest: NOW.getTime() },
          target: rateLimit.key,
        }
      );
    }
  );

  test("refuses with TOO_MANY_REQUESTS once the login reached its wrong tries, checking no password and counting nothing", async () => {
    const { change, tx, verify } = setupChange({
      attempts: {
        count: PASSWORD_ATTEMPTS.max,
        lastRequest: NOW.getTime() - 60_000,
      },
    });

    await expect(change()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { retryAfter: (WINDOW - 60_000) / 1000 },
      message: "Too many wrong passwords: try again later",
    });
    expect(verify).not.toHaveBeenCalled();
    expect(tx.$.insert).not.toHaveBeenCalled();
    expect(tx.$.update).not.toHaveBeenCalled();
  });

  test("one wrong try short of the limit is still checked", async () => {
    const { change, verify } = setupChange({
      attempts: {
        count: PASSWORD_ATTEMPTS.max - 1,
        lastRequest: NOW.getTime() - 60_000,
      },
    });

    await expect(change()).resolves.toEqual({
      id: "admin-b",
      mustChangePassword: false,
    });
    expect(verify).toHaveBeenCalledExactlyOnceWith({
      hash: "hashed:old-password",
      password: "old-password",
    });
  });

  test("the wait ends a whole window after the last wrong try", async () => {
    const { change, verify } = setupChange({
      attempts: {
        count: PASSWORD_ATTEMPTS.max,
        lastRequest: NOW.getTime() - WINDOW,
      },
    });

    await expect(change()).resolves.toEqual({
      id: "admin-b",
      mustChangePassword: false,
    });
    expect(verify).toHaveBeenCalledExactlyOnceWith({
      hash: "hashed:old-password",
      password: "old-password",
    });
  });

  test("answers UNAUTHORIZED to a login removed or disabled, checking no password", async () => {
    const { change, verify } = setupChange({ locked: [] });

    await expect(change()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("the superadmin's protection", () => {
  const OWNER = makeLocked("owner", { role: "superadmin" });

  test("disabling it is FORBIDDEN, writing nothing, even with other logins enabled", async () => {
    const { db, tx } = setup({ locked: [makeLocked("admin-a"), OWNER] });

    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "owner" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "The superadmin's login cannot be changed by another login",
    });
    expect(tx.$.update).not.toHaveBeenCalled();
    expect(tx.$.delete).not.toHaveBeenCalled();
  });

  test("enabling it is FORBIDDEN, writing nothing", async () => {
    const { db, tx } = setup({
      locked: [makeLocked("admin-a"), { ...OWNER, disabledAt: DISABLED_AT }],
    });

    await expect(
      enableLogin(db as never, { actorId: "admin-a", targetId: "owner" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "The superadmin's login cannot be changed by another login",
    });
    expect(tx.$.update).not.toHaveBeenCalled();
  });

  test("resetting its password is FORBIDDEN, writing nothing and ending no session", async () => {
    const { auth, db, tx } = setup({ locked: [makeLocked("admin-a"), OWNER] });

    await expect(
      resetLoginPassword(auth, db as never, {
        actorId: "admin-a",
        password: "temporary-123",
        targetId: "owner",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "The superadmin's login cannot be changed by another login",
    });
    expect(tx.$.update).not.toHaveBeenCalled();
    expect(tx.$.delete).not.toHaveBeenCalled();
  });

  test("a login with the member role is acted on as before", async () => {
    const { db, tx } = setup({
      locked: [
        makeLocked("admin-a", { role: "superadmin" }),
        makeLocked("admin-b"),
      ],
    });
    tx.$["update.returning"].mockResolvedValue([
      { disabledAt: DISABLED_AT, id: "admin-b" },
    ]);

    // The superadmin itself may disable others.
    await expect(
      disableLogin(db as never, { actorId: "admin-a", targetId: "admin-b" })
    ).resolves.toEqual({ disabledAt: DISABLED_AT, id: "admin-b" });
  });

  test("it still changes its own password, knowing the current one", async () => {
    const { auth, db } = setup({ locked: [OWNER] });

    await expect(
      changeOwnPassword(auth, db as never, {
        currentPassword: "old-password",
        newPassword: "new-password-1",
        sessionId: "session-here",
        userId: "owner",
      })
    ).resolves.toEqual({ id: "owner", mustChangePassword: false });
  });
});
