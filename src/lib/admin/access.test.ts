import { ORPCError } from "@orpc/client";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";

import { requireAdmin, requireLogin } from "./access";

interface Me {
  email: string;
  mustChangePassword: boolean;
  name: string;
}

const { me } = vi.hoisted(() => ({
  me: vi.fn<() => Promise<Me>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/orpc/server", () => ({ caller: { admin: { me } } }));

/**
 * `admin.me` answers with the login (on a temporary password when
 * `mustChangePassword`), or fails with `failure`.
 */
function setupMe({
  failure,
  mustChangePassword = false,
}: { failure?: Error; mustChangePassword?: boolean } = {}) {
  const login = {
    email: "ada@example.com",
    mustChangePassword,
    name: "Ada Admin",
  };
  me.mockImplementation(async () => {
    if (failure !== undefined) {
      throw failure;
    }

    return await Promise.resolve(login);
  });

  return { login };
}

const CHECKS = [
  ["requireLogin", requireLogin],
  ["requireAdmin", requireAdmin],
] as const;

describe.each(CHECKS)("%s", (_name, check) => {
  test.each([
    ["en", "/en/admin/orders", "/en/admin/sign-in?next=%2Fen%2Fadmin%2Forders"],
    ["es", "/admin/orders", "/admin/sign-in?next=%2Fadmin%2Forders"],
  ] as const satisfies [Locale, string, string][])(
    "in %s, sends a visitor without a session to the sign-in, coming back to %s",
    async (locale, returnTo, signIn) => {
      setupMe({ failure: new ORPCError("UNAUTHORIZED") });

      await expect(check(returnTo, locale)).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${signIn};307;`,
      });
    }
  );

  test.each([
    ["another oRPC code", new ORPCError("FORBIDDEN", { message: "Forbidden" })],
    ["an outage", new Error("database unavailable")],
  ])("lets %s propagate instead of redirecting", async (_case, error) => {
    setupMe({ failure: error });

    await expect(check("/en/admin", "en")).rejects.toBe(error);
  });
});

describe("requireLogin", () => {
  test("answers the login as admin.me does, a temporary password included", async () => {
    const { login } = setupMe({ mustChangePassword: true });

    await expect(requireLogin("/en/admin/change-password", "en")).resolves.toBe(
      login
    );
    expect(me).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("requireAdmin", () => {
  test("answers only the name and email of a login that chose its own password", async () => {
    setupMe();

    await expect(requireAdmin("/en/admin", "en")).resolves.toStrictEqual({
      email: "ada@example.com",
      name: "Ada Admin",
    });
    expect(me).toHaveBeenCalledExactlyOnceWith();
  });

  test.each([
    [
      "en",
      "/en/admin/orders",
      "/en/admin/change-password?next=%2Fen%2Fadmin%2Forders",
    ],
    ["es", "/admin/users", "/admin/change-password?next=%2Fadmin%2Fusers"],
  ] as const satisfies [Locale, string, string][])(
    "in %s, sends a login on a temporary password to change it, coming back to %s",
    async (locale, returnTo, changePassword) => {
      setupMe({ mustChangePassword: true });

      await expect(requireAdmin(returnTo, locale)).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${changePassword};307;`,
      });
    }
  );
});
