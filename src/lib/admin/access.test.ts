import { ORPCError } from "@orpc/client";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";

import { requireAdmin } from "./access";

const { me } = vi.hoisted(() => ({
  me: vi.fn<() => Promise<{ name: string }>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/orpc/server", () => ({ caller: { admin: { me } } }));

/** `admin.me` answers with the login, or fails with `failure`. */
function setupMe({ failure }: { failure?: Error } = {}) {
  const login = { name: "Ada Admin" };
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
    ["en", "/en/admin/orders", "/en/admin/sign-in?next=%2Fen%2Fadmin%2Forders"],
    ["es", "/admin/orders", "/admin/sign-in?next=%2Fadmin%2Forders"],
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
