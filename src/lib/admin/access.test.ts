import { ORPCError } from "@orpc/client";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";

import {
  type AdminProfile,
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
} from "./access";

const { me } = vi.hoisted(() => ({
  me: vi.fn<() => Promise<AdminProfile>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/orpc/server", () => ({ caller: { admin: { me } } }));

function makeStore(overrides: Partial<AdminProfile["stores"][number]> = {}) {
  return {
    id: 7,
    isActive: true,
    name: "LR Market",
    slug: "lr-market",
    ...overrides,
  };
}

function makeMe(overrides: Partial<AdminProfile> = {}): AdminProfile {
  return {
    name: "Ada Admin",
    role: "member",
    stores: [
      makeStore(),
      makeStore({ id: 8, name: "Sample Store", slug: "sample-store" }),
    ],
    ...overrides,
  };
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
  test("returns the store at the slug, among the login's own", () => {
    const profile = makeMe();

    expect(requireAdminStore(profile, "sample-store")).toBe(profile.stores[1]);
  });

  test.each([
    ["a store the login may not work on", makeMe(), "other-store"],
    ["a login with no stores", makeMe({ stores: [] }), "lr-market"],
  ])("answers 404 for %s", (_name, profile, slug) => {
    expect(() => requireAdminStore(profile, slug)).toThrow(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    );
  });
});

describe("requireStoreSegment", () => {
  test.each(["lr-market", "ab"])(
    "passes the store address %j through",
    (segment) => {
      expect(requireStoreSegment(segment)).toBe(segment);
    }
  );

  test.each(["LR-Market", "a", "lr market", ""])(
    "answers 404 for %j, not a store address",
    (segment) => {
      expect(() => requireStoreSegment(segment)).toThrow(
        expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
      );
    }
  );
});
