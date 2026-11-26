import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { userRouter } from "./user";

// The router is input → the admin's login and store → one service call;
// the queries are `src/server/services/user.test.ts`'s and
// `src/server/better-auth/accounts.test.ts`'s, the access rules
// `src/server/services/access.test.ts`'s.

// The handle `withAdmin` hands its write: distinct from the client, so a
// write that went through the outer client instead would be caught.
const { AUTH, TX, services } = vi.hoisted(() => ({
  AUTH: { api: { getSession: async () => null }, marker: "the app's auth" },
  TX: { handle: "the write's transaction" },
  services: {
    createAccount: vi.fn(async () => ({
      email: "bea@example.test",
      id: "admin-b",
      name: "Bea",
    })),
    disableLogin: vi.fn(async () => ({
      disabledAt: new Date("2026-11-20T12:00:00.000Z"),
      id: "admin-b",
    })),
    enableLogin: vi.fn(async () => ({ disabledAt: null, id: "admin-b" })),
    findAdminStore: vi.fn(),
    listLogins: vi.fn(async () => [
      {
        createdAt: new Date("2026-11-01T10:00:00.000Z"),
        disabledAt: null,
        email: "ana@example.test",
        id: "admin-a",
        mustChangePassword: false,
        name: "Ana",
      },
    ]),
    resetLoginPassword: vi.fn(async () => ({
      id: "admin-b",
      mustChangePassword: true,
    })),
    withAdmin: vi.fn(
      async (
        _db: unknown,
        _userId: unknown,
        write: (handle: unknown) => Promise<unknown>
      ) => await write(TX)
    ),
  },
}));

vi.mock("@/server/services/user", () => ({
  disableLogin: services.disableLogin,
  enableLogin: services.enableLogin,
  listLogins: services.listLogins,
  resetLoginPassword: services.resetLoginPassword,
}));

vi.mock("@/server/better-auth/accounts", () => ({
  createAccount: services.createAccount,
}));

vi.mock("@/server/services/access", () => ({
  findAdminStore: services.findAdminStore,
  withAdmin: services.withAdmin,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({ auth: AUTH }));

const ACTOR = "test-user-id";

const VALID_INPUTS = {
  create: {
    email: " Bea@Example.test ",
    name: " Bea ",
    password: "temporary-123",
  },
  disable: { id: "admin-b" },
  enable: { id: "admin-b" },
  list: undefined,
  resetPassword: { id: "admin-b", password: "temporary-456" },
} as const;

type Procedure = keyof typeof VALID_INPUTS;

const PROCEDURES = Object.keys(VALID_INPUTS) as Procedure[];

/**
 * A signed-in admin working on the store (or a login the database no longer
 * has, or nobody).
 */
function setup({
  isLogin = true,
  signedIn = true,
}: { isLogin?: boolean; signedIn?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.findAdminStore.mockResolvedValue(isLogin ? { id: 7 } : null);
  const options = { context: mockCtx as never };
  const procedures: Record<Procedure, (input: unknown) => Promise<unknown>> = {
    create: async (input) =>
      await call(userRouter.create, input as never, options),
    disable: async (input) =>
      await call(userRouter.disable, input as never, options),
    enable: async (input) =>
      await call(userRouter.enable, input as never, options),
    list: async (input) => await call(userRouter.list, input as never, options),
    resetPassword: async (input) =>
      await call(userRouter.resetPassword, input as never, options),
  };

  return {
    db: mockCtx.db,
    run: async (name: Procedure, input: unknown = VALID_INPUTS[name]) =>
      await procedures[name](input),
  };
}

/** Every service a procedure could reach. */
const SERVICE_SPIES = [
  services.createAccount,
  services.disableLogin,
  services.enableLogin,
  services.listLogins,
  services.resetLoginPassword,
];

describe("user router access", () => {
  test.each(PROCEDURES)(
    "user.%s refuses an anonymous call before reading anything",
    async (name) => {
      const { run } = setup({ signedIn: false });

      await expect(run(name)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
      expect(services.findAdminStore).not.toHaveBeenCalled();
      for (const spy of SERVICE_SPIES) {
        expect(spy).not.toHaveBeenCalled();
      }
    }
  );

  test.each(PROCEDURES)(
    "user.%s refuses a session whose login is gone or disabled",
    async (name) => {
      const { run } = setup({ isLogin: false });

      await expect(run(name)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
      for (const spy of SERVICE_SPIES) {
        expect(spy).not.toHaveBeenCalled();
      }
    }
  );
});

describe("user router", () => {
  test("lists the logins, outside any write", async () => {
    const { db, run } = setup();

    await expect(run("list")).resolves.toEqual([
      {
        createdAt: new Date("2026-11-01T10:00:00.000Z"),
        disabledAt: null,
        email: "ana@example.test",
        id: "admin-a",
        mustChangePassword: false,
        name: "Ana",
      },
    ]);
    expect(services.findAdminStore).toHaveBeenCalledExactlyOnceWith(db, {
      sessionId: "test-session-id",
      userId: ACTOR,
    });
    expect(services.listLogins).toHaveBeenCalledExactlyOnceWith(db);
    expect(services.withAdmin).not.toHaveBeenCalled();
  });

  test("creates a login on a temporary password inside the caller's re-check, normalized", async () => {
    const { db, run } = setup();

    await expect(run("create")).resolves.toEqual({
      email: "bea@example.test",
      id: "admin-b",
      name: "Bea",
    });
    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      ACTOR,
      expect.any(Function)
    );
    expect(services.createAccount).toHaveBeenCalledExactlyOnceWith(
      AUTH,
      TX,
      { email: "bea@example.test", name: "Bea", password: "temporary-123" },
      { mustChangePassword: true }
    );
  });

  test("never writes a role sent with a new login", async () => {
    const { run } = setup();

    await run("create", { ...VALID_INPUTS.create, role: "superadmin" });

    expect(services.createAccount).toHaveBeenCalledExactlyOnceWith(
      AUTH,
      TX,
      { email: "bea@example.test", name: "Bea", password: "temporary-123" },
      { mustChangePassword: true }
    );
  });

  test.each([
    ["disable", services.disableLogin],
    ["enable", services.enableLogin],
  ] as const)(
    "user.%s acts as the session's login on the login the input names",
    async (name, service) => {
      const { db, run } = setup();

      await run(name, { actorId: "someone-else", id: " admin-b " });

      expect(service).toHaveBeenCalledExactlyOnceWith(db, {
        actorId: ACTOR,
        targetId: "admin-b",
      });
    }
  );

  test("resets another login's password as the session's login", async () => {
    const { db, run } = setup();

    await expect(run("resetPassword")).resolves.toEqual({
      id: "admin-b",
      mustChangePassword: true,
    });
    expect(services.resetLoginPassword).toHaveBeenCalledExactlyOnceWith(
      AUTH,
      db,
      { actorId: ACTOR, password: "temporary-456", targetId: "admin-b" }
    );
  });

  test.each([
    ["create", { ...VALID_INPUTS.create, password: "1234567" }],
    ["create", { ...VALID_INPUTS.create, password: "x".repeat(129) }],
    ["create", { ...VALID_INPUTS.create, name: "   " }],
    ["create", { ...VALID_INPUTS.create, email: "bea" }],
    ["disable", { id: "   " }],
    ["disable", { id: "x".repeat(65) }],
    ["enable", { id: "" }],
    ["resetPassword", { id: "admin-b", password: "1234567" }],
    ["resetPassword", { id: "admin-b", password: "x".repeat(129) }],
  ] as const)(
    "user.%s refuses %j with BAD_REQUEST, calling no service",
    async (name, input) => {
      const { run } = setup();

      await expect(run(name, input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      for (const spy of SERVICE_SPIES) {
        expect(spy).not.toHaveBeenCalled();
      }
    }
  );

  test("accepts the bounds themselves: an 8- and a 128-character password, a 64-character id", async () => {
    const { run } = setup();

    await run("resetPassword", { id: "x".repeat(64), password: "12345678" });
    await run("create", { ...VALID_INPUTS.create, password: "x".repeat(128) });

    expect(services.resetLoginPassword).toHaveBeenCalledExactlyOnceWith(
      AUTH,
      expect.anything(),
      { actorId: ACTOR, password: "12345678", targetId: "x".repeat(64) }
    );
    expect(services.createAccount).toHaveBeenCalledExactlyOnceWith(
      AUTH,
      TX,
      expect.objectContaining({ password: "x".repeat(128) }),
      { mustChangePassword: true }
    );
  });
});
