import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { adminRouter } from "./admin";

// The router is session → service; the queries are
// `src/server/services/access.test.ts`'s.

const services = vi.hoisted(() => ({
  findAccessibleStore: vi.fn(),
  getUserRole: vi.fn(),
  listAccessibleStores: vi.fn(),
}));

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
  services.getUserRole.mockResolvedValue(role);
  services.listAccessibleStores.mockResolvedValue(STORES);
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    me: async () => await call(adminRouter.me, undefined, options),
    store: async (input: unknown) =>
      await call(adminRouter.store, input as never, options),
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
      expect(services.getUserRole).toHaveBeenCalledExactlyOnceWith(
        db,
        "test-user-id"
      );
      expect(services.listAccessibleStores).toHaveBeenCalledExactlyOnceWith(
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
    expect(services.listAccessibleStores).not.toHaveBeenCalled();
  });

  test("refuses a signed-out visitor before reading anything", async () => {
    const { me } = setup({ signedIn: false });

    await expect(me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(services.getUserRole).not.toHaveBeenCalled();
  });
});

describe("admin.store", () => {
  test("answers the store the login may work on, without its colors or contacts", async () => {
    const { db, store } = setup();
    services.findAccessibleStore.mockResolvedValue({
      colorAccent: "#c8f31d",
      id: 3,
      isActive: false,
      name: "LR Market",
      slug: "lr-market",
      whatsappNumber: "+59899000000",
    });

    await expect(store({ storeSlug: "lr-market" })).resolves.toEqual({
      id: 3,
      isActive: false,
      name: "LR Market",
      slug: "lr-market",
    });
    expect(services.findAccessibleStore).toHaveBeenCalledExactlyOnceWith(db, {
      slug: "lr-market",
      userId: "test-user-id",
    });
  });

  test("answers NOT_FOUND for a store the login may not work on", async () => {
    const { store } = setup();
    services.findAccessibleStore.mockResolvedValue(null);

    await expect(store({ storeSlug: "tienda-demo" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });
});
