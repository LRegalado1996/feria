import { useLogger } from "evlog/next";
import { afterEach, describe, expect, test, vi } from "vitest";

import { withEvlog } from "@/lib/evlog";

import { safeRequestLogger } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeRequestLogger", () => {
  test("is the very logger evlog gives the request withEvlog wraps", async () => {
    // The wide event is printed when the request ends.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const seen: { evlog?: unknown; ours?: unknown } = {};
    const handler = withEvlog(async (_request: Request) => {
      seen.ours = safeRequestLogger();
      seen.evlog = useLogger();
      return await Promise.resolve(new Response("ok"));
    });

    await handler(new Request("http://localhost/api/orpc/post/create"));

    expect(seen.evlog).toHaveProperty("set", expect.any(Function));
    expect(seen.ours).toBe(seen.evlog);
  });

  test("is undefined outside a request", () => {
    expect(safeRequestLogger()).toBeUndefined();
  });
});
