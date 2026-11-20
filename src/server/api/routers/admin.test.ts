import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { adminRouter } from "./admin";

// The router is session → the login re-read from the database → answer; the
// queries are `src/server/services/access.test.ts`'s.

const services = vi.hoisted(() => ({ findAdminStore: vi.fn() }));

vi.mock("@/server/services/access", () => services);

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

function setup({
  isLogin = true,
  signedIn = true,
}: { isLogin?: boolean; signedIn?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.findAdminStore.mockResolvedValue(isLogin ? { id: 3 } : null);
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    me: async () => await call(adminRouter.me, undefined, options),
  };
}

describe("admin.me", () => {
  test("answers the signed-in login's name and email, once the database confirms the login", async () => {
    const { db, me } = setup();

    await expect(me()).resolves.toEqual({
      email: "test@example.com",
      name: "Test User",
    });
    expect(services.findAdminStore).toHaveBeenCalledExactlyOnceWith(
      db,
      "test-user-id"
    );
  });

  test("treats a session whose user no longer exists as signed out", async () => {
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
    expect(services.findAdminStore).not.toHaveBeenCalled();
  });
});
