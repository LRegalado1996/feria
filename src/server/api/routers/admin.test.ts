import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { adminRouter } from "./admin";

// The router is session → the login re-read from the database → answer or
// one service call; the queries are `src/server/services/access.test.ts`'s
// and `src/server/services/user.test.ts`'s.

const { AUTH, services } = vi.hoisted(() => ({
  AUTH: { api: { getSession: async () => null }, marker: "the app's auth" },
  services: {
    changeOwnPassword: vi.fn(
      async (_auth: unknown, _db: unknown, _values: unknown) => ({
        id: "test-user-id",
        mustChangePassword: false,
      })
    ),
    findLogin: vi.fn(),
  },
}));

vi.mock("@/server/services/access", () => ({ findLogin: services.findLogin }));

vi.mock("@/server/services/user", () => ({
  changeOwnPassword: services.changeOwnPassword,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({ auth: AUTH }));

const PASSWORDS = {
  currentPassword: "synthetic-temporary-123",
  newPassword: "my-own-password",
};

/**
 * A signed-in login (on a temporary password or its own), a login the
 * database no longer has or has disabled, or nobody.
 */
function setup({
  isLogin = true,
  mustChangePassword = false,
  signedIn = true,
}: {
  isLogin?: boolean;
  mustChangePassword?: boolean;
  signedIn?: boolean;
} = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.findLogin.mockResolvedValue(
    isLogin ? { id: "test-user-id", mustChangePassword } : null
  );
  const options = { context: mockCtx as never };

  return {
    changePassword: async (input: unknown) =>
      await call(adminRouter.changePassword, input as never, options),
    db: mockCtx.db,
    me: async () => await call(adminRouter.me, undefined, options),
  };
}

describe("admin.me", () => {
  test.each([false, true])(
    "answers the login's name, email and whether it must change its password (%s), once the database confirms it",
    async (mustChangePassword) => {
      const { db, me } = setup({ mustChangePassword });

      await expect(me()).resolves.toEqual({
        email: "test@example.com",
        mustChangePassword,
        name: "Test User",
      });
      expect(services.findLogin).toHaveBeenCalledExactlyOnceWith(db, {
        sessionId: "test-session-id",
        userId: "test-user-id",
      });
    }
  );

  test("treats a session whose login is gone or disabled as signed out", async () => {
    const { me } = setup({ isLogin: false });

    await expect(me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  });

  test("refuses a signed-out visitor before reading anything", async () => {
    const { me } = setup({ signedIn: false });

    await expect(me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.findLogin).not.toHaveBeenCalled();
  });
});

describe("admin.changePassword", () => {
  test("changes the session's own login's password, keeping the session making the change", async () => {
    const { changePassword, db } = setup({ mustChangePassword: true });

    await expect(changePassword(PASSWORDS)).resolves.toEqual({
      id: "test-user-id",
      mustChangePassword: false,
    });
    expect(services.changeOwnPassword).toHaveBeenCalledExactlyOnceWith(
      AUTH,
      db,
      {
        ...PASSWORDS,
        sessionId: "test-session-id",
        userId: "test-user-id",
      }
    );
  });

  test("never takes the login from the input", async () => {
    const { changePassword } = setup();

    await changePassword({ ...PASSWORDS, userId: "someone-else" });

    expect(services.changeOwnPassword).toHaveBeenCalledExactlyOnceWith(
      AUTH,
      expect.anything(),
      expect.objectContaining({ userId: "test-user-id" })
    );
  });

  test.each([
    [
      "a new password the same as the current one",
      { newPassword: "synthetic-temporary-123" },
    ],
    ["a new password one character short", { newPassword: "1234567" }],
    ["a new password past 128 characters", { newPassword: "x".repeat(129) }],
    ["an empty current password", { currentPassword: "" }],
  ])(
    "refuses %s with BAD_REQUEST, changing nothing",
    async (_case, overrides) => {
      const { changePassword } = setup();

      await expect(
        changePassword({ ...PASSWORDS, ...overrides })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      expect(services.changeOwnPassword).not.toHaveBeenCalled();
    }
  );

  test("accepts a new password of exactly 8 and of exactly 128 characters", async () => {
    const { changePassword } = setup();

    await changePassword({ ...PASSWORDS, newPassword: "12345678" });
    await changePassword({ ...PASSWORDS, newPassword: "x".repeat(128) });

    expect(
      services.changeOwnPassword.mock.calls.map((args) => args[2])
    ).toEqual([
      expect.objectContaining({ newPassword: "12345678" }),
      expect.objectContaining({ newPassword: "x".repeat(128) }),
    ]);
  });

  test.each([
    ["a signed-out visitor", { signedIn: false }],
    ["a login gone or disabled", { isLogin: false }],
  ])("refuses %s with UNAUTHORIZED", async (_case, options) => {
    const { changePassword } = setup(options);

    await expect(changePassword(PASSWORDS)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.changeOwnPassword).not.toHaveBeenCalled();
  });
});
