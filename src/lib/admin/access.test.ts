import { ORPCError } from "@orpc/client";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";

import { requireAdmin, requireAdminStore } from "./access";

const { me, store } = vi.hoisted(() => ({
  me: vi.fn<() => Promise<unknown>>(),
  store: vi.fn<(input: { storeSlug: string }) => Promise<unknown>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/orpc/server", () => ({ caller: { admin: { me, store } } }));

function makeMe() {
  return {
    name: "Ada Admin",
    role: "member",
    stores: [{ isActive: true, name: "LR Market", slug: "lr-market" }],
  };
}

function makeStore() {
  return { id: 7, isActive: true, name: "LR Market", slug: "lr-market" };
}

/** `admin.me` answers with the login, or fails with `failure`. */
function setupMe({ failure }: { failure?: Error } = {}) {
  const login = makeMe();
  me.mockImplementation(async () => {
    if (failure !== undefined) {
      throw failure;
    }

    return await Promise.resolve(login);
  });

  return { login };
}

/**
 * `admin.store` answers by the slug it was asked for: the login's one store,
 * NOT_FOUND for any other, or `failure` for every slug.
 */
function setupStore({ failure }: { failure?: Error } = {}) {
  const found = makeStore();
  store.mockImplementation(async ({ storeSlug }) => {
    if (failure !== undefined) {
      throw failure;
    }

    if (storeSlug !== found.slug) {
      throw new ORPCError("NOT_FOUND");
    }

    return await Promise.resolve(found);
  });

  return { found };
}

describe("requireAdmin", () => {
  test("returns the signed-in login as admin.me answers it", async () => {
    const { login } = setupMe();

    await expect(requireAdmin("/en/admin", "en")).resolves.toBe(login);
    expect(me).toHaveBeenCalledExactlyOnceWith();
  });

  test.each([
    [
      "en",
      "/en/admin/lr-market/orders",
      "/en/admin/sign-in?next=%2Fen%2Fadmin%2Flr-market%2Forders",
    ],
    [
      "es",
      "/admin/lr-market/orders",
      "/admin/sign-in?next=%2Fadmin%2Flr-market%2Forders",
    ],
  ] as const satisfies [Locale, string, string][])(
    "in %s, sends a visitor without a session to the sign-in, coming back to %s",
    async (locale, returnTo, signIn) => {
      setupMe({ failure: new ORPCError("UNAUTHORIZED") });

      await expect(requireAdmin(returnTo, locale)).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${signIn};307;`,
      });
    }
  );

  test.each([
    ["another oRPC code", new ORPCError("FORBIDDEN", { message: "Forbidden" })],
    ["an outage", new Error("database unavailable")],
  ])("lets %s propagate instead of redirecting", async (_name, error) => {
    setupMe({ failure: error });

    await expect(requireAdmin("/en/admin", "en")).rejects.toBe(error);
  });
});

describe("requireAdminStore", () => {
  test("returns the store the login may work on, asked by its slug", async () => {
    const { found } = setupStore();

    await expect(requireAdminStore("lr-market")).resolves.toBe(found);
    expect(store).toHaveBeenCalledExactlyOnceWith({ storeSlug: "lr-market" });
  });

  test.each(["LR-Market", "a", "lr market"])(
    "answers 404 for %j, not a store address, without asking",
    async (segment) => {
      setupStore();

      await expect(requireAdminStore(segment)).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(store).not.toHaveBeenCalled();
    }
  );

  test("answers 404 for a store the login may not work on", async () => {
    setupStore();

    await expect(requireAdminStore("sample-store")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(store).toHaveBeenCalledExactlyOnceWith({
      storeSlug: "sample-store",
    });
  });

  test("lets any other failure propagate, so an outage is never a 404", async () => {
    const outage = new Error("database unavailable");
    setupStore({ failure: outage });

    await expect(requireAdminStore("lr-market")).rejects.toBe(outage);
  });
});
