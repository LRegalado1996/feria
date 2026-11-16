import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { adminRouter } from "./admin";

// The router is session → service; the queries are
// `src/server/services/access.test.ts`'s.

const services = vi.hoisted(() => ({ getAdminProfile: vi.fn() }));

vi.mock("@/server/services/access", () => services);

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORES = [
  { id: 3, isActive: true, name: "LR Market", slug: "lr-market" },
];

function setup({
  role = "member",
  signedIn = true,
}: { role?: "member" | "superadmin" | null; signedIn?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.getAdminProfile.mockResolvedValue(
    role === null ? null : { role, stores: STORES }
  );
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    me: async () => await call(adminRouter.me, undefined, options),
  };
}

describe("admin.me", () => {
  test.each(["member", "superadmin"] as const)(
    "answers the %s's name, the role the database holds and the stores it may open",
    async (role) => {
      const { db, me } = setup({ role });

      await expect(me()).resolves.toEqual({
        name: "Test User",
        role,
        stores: STORES,
      });
      expect(services.getAdminProfile).toHaveBeenCalledExactlyOnceWith(
        db,
        "test-user-id"
      );
    }
  );

  test("treats a session whose user no longer exists as signed out", async () => {
    const { me } = setup({ role: null });

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
    expect(services.getAdminProfile).not.toHaveBeenCalled();
  });
});
