import { describe, expect, test, vi } from "vitest";

import { account, user } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { type AccountAuth, createAccount } from "./accounts";

function makeValues(overrides: Record<string, unknown> = {}) {
  return {
    email: "Owner@Example.com ",
    name: " Store Owner ",
    password: "synthetic-pass-123",
    role: "member" as const,
    ...overrides,
  };
}

/** What Postgres raises when the email's unique constraint is hit. */
function emailUniqueViolation() {
  return Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint: "user_email_unique",
  });
}

/** A database double and Better Auth's hasher and id generator. */
function setup({
  existing = false,
  insertFails = null,
}: { existing?: boolean; insertFails?: Error | null } = {}) {
  const db = createMockDatabase();
  // The transaction's own handle, distinct from the client: every read and
  // write must go through it to be part of the transaction.
  const tx = createMockDatabase();
  db.$.transaction.mockImplementation(
    async (callback: unknown) =>
      await (callback as (handle: unknown) => Promise<unknown>)(tx)
  );
  tx.query.user.findFirst.mockResolvedValue(
    existing ? { id: "other" } : undefined
  );

  if (insertFails) {
    tx.$["insert.values"].mockImplementationOnce(() => {
      throw insertFails;
    });
  }

  const hash = vi.fn(async (password: string) => `hashed:${password}`);
  const generateId = vi.fn(
    ({ model }: { model: string }) => `generated-${model}`
  );
  const auth = {
    $context: Promise.resolve({ generateId, password: { hash } }),
  } as unknown as AccountAuth;

  return {
    db,
    tx,
    hash,
    create: async (overrides: Record<string, unknown> = {}) =>
      await createAccount(auth, db as never, makeValues(overrides)),
  };
}

describe("createAccount", () => {
  test("writes the user with its role and a hashed credential in one transaction, normalized", async () => {
    const { create, db, hash, tx } = setup();

    await expect(create({ role: "superadmin" })).resolves.toEqual({
      email: "owner@example.com",
      id: "generated-user",
      name: "Store Owner",
      role: "superadmin",
    });
    expect(hash).toHaveBeenCalledExactlyOnceWith("synthetic-pass-123");
    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(tx.$.insert.mock.calls).toEqual([[user], [account]]);
    expect(tx.$["insert.values"].mock.calls).toEqual([
      [
        {
          email: "owner@example.com",
          emailVerified: false,
          id: "generated-user",
          name: "Store Owner",
          role: "superadmin",
        },
      ],
      [
        {
          accountId: "generated-user",
          id: "generated-account",
          password: "hashed:synthetic-pass-123",
          providerId: "credential",
          userId: "generated-user",
        },
      ],
    ]);
  });

  test("looks for an existing login by the normalized email", async () => {
    const { create, tx } = setup();

    await create();

    const [config] = tx.query.user.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: ["owner@example.com"],
      sql: '"user"."email" = $1',
    });
  });

  test("refuses an email that already has a login with CONFLICT, writing nothing", async () => {
    const { create, tx } = setup({ existing: true });

    await expect(create()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "An account with that email already exists",
    });
    expect(tx.$.insert).not.toHaveBeenCalled();
  });

  test("answers CONFLICT when another request created the same email after the check", async () => {
    const { create, tx } = setup({ insertFails: emailUniqueViolation() });

    await expect(create()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "An account with that email already exists",
    });
    expect(tx.$.insert).not.toHaveBeenCalledWith(account);
  });

  test("lets any other failure propagate, so the transaction rolls back", async () => {
    const { create } = setup({ insertFails: new Error("connection lost") });

    await expect(create()).rejects.toThrow("connection lost");
  });

  test.each([
    ["a password one character short", { password: "1234567" }],
    ["a blank name", { name: "   " }],
    ["an email that is not one", { email: "owner" }],
    ["a role that does not exist", { role: "owner" }],
  ])(
    "refuses %s with BAD_REQUEST before touching the database",
    async (_case, overrides) => {
      const { create, db } = setup();

      await expect(create(overrides)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "The account's email, name, password or role is not valid",
      });
      expect(db.$.transaction).not.toHaveBeenCalled();
    }
  );

  test("accepts a password of exactly eight characters", async () => {
    const { create } = setup();

    await expect(create({ password: "12345678" })).resolves.toMatchObject({
      id: "generated-user",
    });
  });
});
