import { describe, expect, test, vi } from "vitest";

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

/** A Better Auth context double: the adapter and hasher `createAccount` calls. */
function setup({
  existing = null,
  linkFails = false,
}: { existing?: { id: string } | null; linkFails?: boolean } = {}) {
  const internalAdapter = {
    createUser: vi.fn(async (user: { email: string; name: string }) => ({
      ...user,
      id: "new-user",
    })),
    deleteUser: vi.fn(async (_id: string) => undefined),
    findUserByEmail: vi.fn(async (_email: string) => existing),
    linkAccount: vi.fn(async (_account: Record<string, string>) => {
      if (linkFails) {
        throw new Error("account insert failed");
      }
    }),
  };
  const hash = vi.fn(async (password: string) => `hashed:${password}`);
  const auth = {
    $context: Promise.resolve({ internalAdapter, password: { hash } }),
  } as unknown as AccountAuth;

  return {
    hash,
    internalAdapter,
    create: async (overrides: Record<string, unknown> = {}) =>
      await createAccount(auth, makeValues(overrides)),
  };
}

describe("createAccount", () => {
  test("creates the user with its role and a hashed credential, normalized", async () => {
    const { create, hash, internalAdapter } = setup();

    await expect(create({ role: "superadmin" })).resolves.toEqual({
      email: "owner@example.com",
      id: "new-user",
      name: "Store Owner",
      role: "superadmin",
    });
    expect(internalAdapter.findUserByEmail).toHaveBeenCalledExactlyOnceWith(
      "owner@example.com"
    );
    expect(hash).toHaveBeenCalledExactlyOnceWith("synthetic-pass-123");
    expect(internalAdapter.createUser).toHaveBeenCalledExactlyOnceWith(
      {
        email: "owner@example.com",
        emailVerified: false,
        name: "Store Owner",
        role: "superadmin",
      },
      { method: "admin" }
    );
    expect(internalAdapter.linkAccount).toHaveBeenCalledExactlyOnceWith({
      accountId: "new-user",
      password: "hashed:synthetic-pass-123",
      providerId: "credential",
      userId: "new-user",
    });
  });

  test("refuses an email that already has an account with CONFLICT, creating nothing", async () => {
    const { create, internalAdapter } = setup({ existing: { id: "other" } });

    await expect(create()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "An account with that email already exists",
    });
    expect(internalAdapter.createUser).not.toHaveBeenCalled();
  });

  test("deletes the user again when its credential cannot be stored", async () => {
    const { create, internalAdapter } = setup({ linkFails: true });

    await expect(create()).rejects.toThrow("account insert failed");
    expect(internalAdapter.deleteUser).toHaveBeenCalledExactlyOnceWith(
      "new-user"
    );
  });

  test.each([
    ["a password one character short", { password: "1234567" }],
    ["a blank name", { name: "   " }],
    ["an email that is not one", { email: "owner" }],
    ["a role that does not exist", { role: "owner" }],
  ])("refuses %s before touching the database", async (_case, overrides) => {
    const { create, internalAdapter } = setup();

    await expect(create(overrides)).rejects.toMatchObject({ name: "ZodError" });
    expect(internalAdapter.findUserByEmail).not.toHaveBeenCalled();
  });

  test("accepts a password of exactly eight characters", async () => {
    const { create } = setup();

    await expect(create({ password: "12345678" })).resolves.toMatchObject({
      id: "new-user",
    });
  });
});
