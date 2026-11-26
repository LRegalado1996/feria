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

  test.each([
    ["POST", POST, "/api/auth/sign-up/email"],
    ["GET", GET, "/api/auth/sign-up/email"],
    ["POST", POST, "/api/auth/sign-up"],
    ["POST", POST, "/api/auth/sign-up/social"],
    ["POST", POST, "/api/auth//sign-up/email"],
    ["POST", POST, "/api/auth/sign%2Dup/email"],
    ["POST", POST, "/api/auth/Sign-Up/email"],
  ])(
    "%s %s answers 404 without reaching Better Auth: sign-up is closed",
    async (method, route, path) => {
      const response = await route(
        new Request(`http://localhost:3000${path}`, { method })
      );

      expect(response.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["POST", POST, "/api/auth/change-password"],
    ["POST", POST, "/api/auth//Change%2Dpassword"],
    ["POST", POST, "/api/auth/set-password"],
    ["POST", POST, "/api/auth/change-email"],
    ["GET", GET, "/api/auth/change-password"],
  ])(
    "%s %s answers 404 without reaching Better Auth: a password or an email changes only through the admin (FER-015)",
    async (method, route, path) => {
      const response = await route(
        new Request(`http://localhost:3000${path}`, { method })
      );

      expect(response.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  test("a path that only starts with the same letters still reaches Better Auth", async () => {
    const request = new Request("http://localhost:3000/api/auth/sign-up-x", {
      method: "POST",
    });

    await POST(request);

    expect(handler).toHaveBeenCalledExactlyOnceWith(request);
  });
});
