import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn<(options: { returnHeaders?: boolean }) => unknown>(),
}));

vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession } } }));

const SESSION = {
  user: { id: "user-1", email: "alice@example.com", name: "Alice" },
  session: { id: "session-1", userId: "user-1" },
};

// The access check reads the session itself; the procedure context asks for
// Better Auth's response headers too (`returnHeaders`).
function setup({ signedIn = true } = {}) {
  const session = signedIn ? SESSION : null;
  getSession.mockImplementation(async (options) => {
    await Promise.resolve();
    return options.returnHeaders
      ? { headers: new Headers(), response: session }
      : session;
  });

  return {
    get: async (path: string) => {
      const request = new NextRequest(`http://localhost:3000/api/docs${path}`);
      return { request, response: await GET(request) };
    },
  };
}

describe("API docs route", () => {
  test("redirects a signed-out visitor to the home page, deciding past the cookie cache", async () => {
    const { get } = setup({ signedIn: false });

    const { request, response } = await get("");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(getSession).toHaveBeenCalledExactlyOnceWith({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
  });

  test("serves the OpenAPI spec of the app router to a signed-in user", async () => {
    const { get } = setup();

    const { response } = await get("/spec.json");

    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(spec).toMatchObject({
      info: { title: "API", version: "1.0.0" },
      servers: [{ url: "http://localhost:3000/api/docs" }],
    });
    expect(
      Object.entries(spec.paths).map(([path, methods]) => [
        path,
        Object.keys(methods),
      ])
    ).toEqual([
      ["/admin/me", ["get"]],
      ["/admin/filters", ["get", "post"]],
      ["/admin/filters/{id}", ["put", "delete"]],
      ["/admin/filters/order", ["put"]],
      ["/admin/filter-values", ["post"]],
      ["/admin/filter-values/{id}", ["put", "delete"]],
      ["/admin/filter-values/order", ["put"]],
      ["/cart-products", ["get"]],
      ["/categories", ["get"]],
      ["/filters", ["get"]],
      ["/products", ["get"]],
      ["/products/{slug}", ["get"]],
      ["/products/{slug}/related", ["get"]],
      ["/admin/categories", ["get", "post"]],
      ["/admin/categories/{id}", ["put", "delete"]],
      ["/admin/categories/{id}/page", ["put"]],
      ["/admin/categories/order", ["put"]],
      ["/admin/coming-soon", ["get", "put"]],
      ["/admin/coming-soon/published", ["put"]],
      ["/admin/home", ["get"]],
      ["/admin/home/announcement", ["put"]],
      ["/admin/home/banners", ["post"]],
      ["/admin/home/banners/{id}", ["put", "delete"]],
      ["/admin/home/layout", ["put"]],
      ["/orders", ["post"]],
      ["/orders/{token}", ["get"]],
      ["/admin/orders", ["get"]],
      ["/admin/order-counts", ["get"]],
      ["/admin/orders/{id}", ["get"]],
      ["/admin/orders/{id}/status", ["put"]],
      ["/admin/products", ["get", "post"]],
      ["/admin/products/{id}", ["get", "put", "delete"]],
      ["/admin/products/{id}/publish", ["post"]],
      ["/admin/products/{id}/unpublish", ["post"]],
      ["/admin/products/{id}/availability", ["put"]],
      ["/store", ["get", "put"]],
      ["/admin/uploads/token", ["post"]],
    ]);
  });

  test("answers a path with no page or procedure with 404", async () => {
    const { get } = setup();

    const { response } = await get("/missing");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });
});
