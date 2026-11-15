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
      ["/stores/{storeSlug}/admin/filters", ["get", "post"]],
      ["/stores/{storeSlug}/admin/filters/{id}", ["put", "delete"]],
      ["/stores/{storeSlug}/admin/filters/order", ["put"]],
      ["/stores/{storeSlug}/admin/filter-values", ["post"]],
      ["/stores/{storeSlug}/admin/filter-values/{id}", ["put", "delete"]],
      ["/stores/{storeSlug}/admin/filter-values/order", ["put"]],
      ["/stores/{storeSlug}/categories", ["get"]],
      ["/stores/{storeSlug}/filters", ["get"]],
      ["/stores/{storeSlug}/products", ["get"]],
      ["/stores/{storeSlug}/products/{slug}", ["get"]],
      ["/stores/{storeSlug}/products/{slug}/related", ["get"]],
      ["/stores/{storeSlug}/admin/categories", ["get", "post"]],
      ["/stores/{storeSlug}/admin/categories/{id}", ["put", "delete"]],
      ["/stores/{storeSlug}/admin/categories/order", ["put"]],
      ["/stores/{storeSlug}/orders", ["post"]],
      ["/stores/{storeSlug}/orders/{token}", ["get"]],
      ["/stores/{storeSlug}/admin/orders", ["get"]],
      ["/stores/{storeSlug}/admin/orders/{id}", ["get"]],
      ["/stores/{storeSlug}/admin/orders/{id}/status", ["put"]],
      ["/posts", ["post", "get"]],
      ["/posts/{id}", ["delete"]],
      ["/stores/{storeSlug}/admin/products", ["post"]],
      ["/stores/{storeSlug}/admin/products/{id}", ["put", "delete"]],
      ["/stores/{storeSlug}/admin/products/{id}/publish", ["post"]],
      ["/stores/{storeSlug}/admin/products/{id}/unpublish", ["post"]],
      ["/stores/{storeSlug}/admin/products/{id}/availability", ["put"]],
      ["/stores/{storeSlug}/admin/products/{id}/images/order", ["put"]],
      ["/stores/{storeSlug}/admin/products/{id}/filter-values", ["put"]],
      ["/stores/{slug}", ["get"]],
      ["/stores", ["post"]],
      ["/stores/{id}", ["put"]],
    ]);
  });

  test("answers a path with no page or procedure with 404", async () => {
    const { get } = setup();

    const { response } = await get("/missing");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });
});
