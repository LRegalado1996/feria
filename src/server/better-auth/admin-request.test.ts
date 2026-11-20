import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

import { isAdminRequest } from "./admin-request";

const { authGetSession, findAdminStore } = vi.hoisted(() => ({
  authGetSession: vi.fn<(options: unknown) => Promise<unknown>>(),
  findAdminStore: vi.fn<(db: unknown, userId: string) => Promise<unknown>>(),
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: authGetSession } },
}));

vi.mock("@/server/services/access", () => ({ findAdminStore }));

const SESSION_COOKIE = "better-auth.session_token=token-1.signature";

/**
 * A request with or without Better Auth's session cookie, the session the
 * database finds for it and whether its login is still there.
 */
function setup({
  cookie = SESSION_COOKIE,
  isLogin = true,
  session = { session: { id: "session-1" }, user: { id: "user-1" } },
}: {
  cookie?: string | null;
  isLogin?: boolean;
  session?: { session: { id: string }; user: { id: string } } | null;
} = {}) {
  authGetSession.mockResolvedValue(session);
  findAdminStore.mockResolvedValue(isLogin ? { id: 7 } : null);

  return {
    headers: new Headers(cookie === null ? {} : { cookie }),
  };
}

describe("isAdminRequest", () => {
  test("a signed-in login is an admin: its session read past the cookie cache, its login re-read", async () => {
    const { headers } = setup();

    await expect(isAdminRequest(headers)).resolves.toBe(true);
    expect(authGetSession).toHaveBeenCalledExactlyOnceWith({
      headers,
      query: { disableCookieCache: true },
    });
    expect(findAdminStore).toHaveBeenCalledExactlyOnceWith(db, "user-1");
  });

  test.each([
    ["no cookie at all", null],
    ["only other cookies", "lr-store-preview=1; theme=dark"],
  ])(
    "a request with %s is the public's, and costs no query",
    async (_case, cookie) => {
      const { headers } = setup({ cookie });

      await expect(isAdminRequest(headers)).resolves.toBe(false);
      expect(authGetSession).not.toHaveBeenCalled();
      expect(findAdminStore).not.toHaveBeenCalled();
    }
  );

  test("a session cookie the database does not know (forged, expired, signed out) is no admin", async () => {
    const { headers } = setup({ session: null });

    await expect(isAdminRequest(headers)).resolves.toBe(false);
    expect(findAdminStore).not.toHaveBeenCalled();
  });

  test("a session whose login was removed is no admin", async () => {
    const { headers } = setup({ isLogin: false });

    await expect(isAdminRequest(headers)).resolves.toBe(false);
  });

  test("a failure reaches the caller, which decides how to fail", async () => {
    const { headers } = setup();
    const outage = new Error("connection refused");
    authGetSession.mockRejectedValue(outage);

    await expect(isAdminRequest(headers)).rejects.toBe(outage);
  });
});
