import { describe, expect, test, vi } from "vitest";

import { GET, POST } from "./route";

const { handler } = vi.hoisted(() => ({
  handler: vi.fn(
    async (_request: Request) => await Promise.resolve(new Response("auth"))
  ),
}));

vi.mock("@/server/better-auth", () => ({ auth: { handler } }));

describe("auth route", () => {
  test.each([
    ["GET", GET],
    ["POST", POST],
  ])("%s hands the request to Better Auth", async (method, route) => {
    const request = new Request("http://localhost:3000/api/auth/get-session", {
      method,
    });

    const response = await route(request);

    expect(handler).toHaveBeenCalledExactlyOnceWith(request);
    expect(await response.text()).toBe("auth");
  });
});
