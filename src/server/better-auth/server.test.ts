import { describe, expect, test, vi } from "vitest";

import { getSession } from "./server";

const { authGetSession, requestHeaders } = vi.hoisted(() => ({
  authGetSession: vi.fn(
    async (): Promise<unknown> => await Promise.resolve(null)
  ),
  requestHeaders: new Headers({ cookie: "session=abc" }),
}));

vi.mock("next/headers", () => ({
  headers: async () => await Promise.resolve(requestHeaders),
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: authGetSession } },
}));

describe("getSession", () => {
  test("reads the session from the request, past the cookie cache", async () => {
    const session = { user: { id: "user-1" }, session: { id: "session-1" } };
    authGetSession.mockResolvedValue(session);

    await expect(getSession()).resolves.toBe(session);
    expect(authGetSession).toHaveBeenCalledExactlyOnceWith({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
  });
});
