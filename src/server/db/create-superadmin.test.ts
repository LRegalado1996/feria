import { describe, expect, test, vi } from "vitest";

import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { createSuperadmin } from "./create-superadmin";

const { createAccount } = vi.hoisted(() => ({
  createAccount: vi.fn(
    async (_auth: unknown, _db: unknown, values: { email: string }) => ({
      email: values.email,
      id: "admin-1",
      name: "Superadmin",
    })
  ),
}));

vi.mock("@/server/better-auth/accounts", () => ({ createAccount }));

const ENV = {
  SUPERADMIN_EMAIL: "admin@example.com",
  SUPERADMIN_PASSWORD: "synthetic-pass-123",
};

function setup({ loginExists = false } = {}) {
  const db = createMockDatabase();
  // The transaction's own handle, and whether its callback is still running.
  const tx = createMockDatabase();
  const transaction = { open: false };
  db.$.transaction.mockImplementation(async (callback: unknown) => {
    transaction.open = true;
    try {
      return await (callback as (handle: unknown) => Promise<unknown>)(tx);
    } finally {
      transaction.open = false;
    }
  });
  tx.query.user.findFirst.mockResolvedValue(
    loginExists ? { id: "admin-0" } : undefined
  );
  const auth = { $context: Promise.resolve({}) };

  return {
    auth,
    db,
    transaction,
    tx,
    run: async (env: Record<string, string | undefined> = ENV) =>
      await createSuperadmin({ auth: auth as never, db: db as never, env }),
  };
}

describe("createSuperadmin", () => {
  test("creates the first login from the environment's email and password, as the superadmin", async () => {
    const { auth, run, tx } = setup();

    await expect(run()).resolves.toMatchObject({ email: "admin@example.com" });
    expect(createAccount).toHaveBeenCalledExactlyOnceWith(
      auth,
      tx,
      {
        email: "admin@example.com",
        name: "Superadmin",
        password: "synthetic-pass-123",
      },
      { role: "superadmin" }
    );
  });

  test("takes the name from SUPERADMIN_NAME when it is set", async () => {
    const { auth, run } = setup();

    await run({ ...ENV, SUPERADMIN_NAME: "Lucía" });

    expect(createAccount).toHaveBeenCalledExactlyOnceWith(
      auth,
      expect.anything(),
      expect.objectContaining({ name: "Lucía" }),
      { role: "superadmin" }
    );
  });

  test("takes a lock for the whole check and creation, inside one transaction", async () => {
    const { db, run, transaction, tx } = setup();
    let createdInsideTransaction = false;
    createAccount.mockImplementationOnce(
      async (_auth: unknown, handle: unknown, values: { email: string }) => {
        createdInsideTransaction = transaction.open && handle === tx;
        return { email: values.email, id: "admin-1", name: "S" };
      }
    );

    await run();

    expect(renderQuery(tx.$.execute.mock.calls[0]?.[0])).toEqual({
      params: ["user.first-superadmin"],
      sql: "select pg_advisory_xact_lock(hashtext($1))",
    });
    expect(tx.$.execute.mock.invocationCallOrder[0]).toBeLessThan(
      tx.query.user.findFirst.mock.invocationCallOrder[0] ?? 0
    );
    expect(db.$.execute).not.toHaveBeenCalled();
    expect(createdInsideTransaction).toBe(true);
  });

  test("refuses once any login exists, creating nothing", async () => {
    const { run, tx } = setup({ loginExists: true });

    await expect(run()).rejects.toThrow(
      "A login already exists: this script only creates the first one"
    );
    // Any login at all, whatever its role: every login is an admin.
    expect(tx.query.user.findFirst).toHaveBeenCalledExactlyOnceWith({
      columns: { id: true },
    });
    expect(createAccount).not.toHaveBeenCalled();
  });

  test.each([
    [
      "no email",
      { SUPERADMIN_PASSWORD: ENV.SUPERADMIN_PASSWORD },
      "SUPERADMIN_EMAIL must be an email address",
    ],
    [
      "no password",
      { SUPERADMIN_EMAIL: ENV.SUPERADMIN_EMAIL },
      "SUPERADMIN_PASSWORD is required",
    ],
    [
      "a name over 120 characters",
      { ...ENV, SUPERADMIN_NAME: "x".repeat(121) },
      "SUPERADMIN_NAME must be at most 120 characters",
    ],
    [
      "a password one character short",
      { ...ENV, SUPERADMIN_PASSWORD: "1234567" },
      "SUPERADMIN_PASSWORD must be at least 8 characters",
    ],
  ])(
    "refuses %s with a message that names the rule, never the value",
    async (_case, env, message) => {
      const { run } = setup();

      await expect(run(env)).rejects.toMatchObject({ message });
      expect(createAccount).not.toHaveBeenCalled();
    }
  );
});
