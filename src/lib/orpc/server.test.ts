import { describe, expect, test, vi } from "vitest";

import { caller, getQueryClient } from "./server";

const { getSession, requestHeaders } = vi.hoisted(() => ({
  getSession: vi.fn(
    async (): Promise<{ headers: Headers; response: unknown }> =>
      await Promise.resolve({ headers: new Headers(), response: null })
  ),
  requestHeaders: new Headers({ cookie: "session=abc" }),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => await Promise.resolve(requestHeaders),
}));

vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession } } }));

describe("server oRPC caller", () => {
  test("builds each call's context from the incoming request headers", async () => {
    await expect(caller.post.create({ name: "Hello" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });

    expect(getSession).toHaveBeenCalledExactlyOnceWith({
      headers: requestHeaders,
      returnHeaders: true,
    });
  });

  test("prefetches with the app's QueryClient defaults", () => {
    expect(getQueryClient().getDefaultOptions().queries?.staleTime).toBe(1000);
  });
});
