import { readdirSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { LOCALES } from "@/lib/i18n/config";

import { config, proxy } from "./proxy";

const mocks = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn<
    (error: unknown, scope: { action: string }) => string | null
  >(() => null),
  // Signed out unless a test says otherwise: the public.
  isAdminRequest: vi.fn<(headers: Headers) => Promise<boolean>>(
    async () => await Promise.resolve(false)
  ),
  // Open unless a test closes it: the language rules run on their own.
  isStorefrontClosed: vi.fn<() => Promise<boolean>>(
    async () => await Promise.resolve(false)
  ),
}));

// The switch's own read and its fail-safe are `storefront-switch.test.ts`'s;
// the session check is `admin-request.test.ts`'s.
vi.mock("@/server/cache/storefront-switch", () => ({
  isStorefrontClosed: mocks.isStorefrontClosed,
}));

vi.mock("@/server/better-auth/admin-request", () => ({
  isAdminRequest: mocks.isAdminRequest,
}));

vi.mock("@/lib/sentry", () => ({
  captureExceptionWithScope: mocks.captureExceptionWithScope,
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORIGIN = "http://localhost:3000";

/** What the proxy did with a page request: the three outcomes it has. */
async function route(path: string, headers: Record<string, string> = {}) {
  const response = await proxy(
    new NextRequest(`${ORIGIN}${path}`, { headers })
  );

  return {
    // evlog types its response by the two header methods it uses.
    status: "status" in response ? response.status : null,
    redirectedTo: response.headers.get("location"),
    rewrittenTo: response.headers.get("x-middleware-rewrite"),
    passedThrough: response.headers.get("x-middleware-next") === "1",
    requestId: response.headers.get("x-request-id"),
  };
}

describe("proxy: /api requests", () => {
  test("stamps a request id and the start time on the forwarded request and the response", async () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));

    const response = await proxy(
      new NextRequest(`${ORIGIN}/api/orpc/category/create`)
    );
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(UUID);
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      requestId
    );
    expect(response.headers.get("x-middleware-request-x-evlog-start")).toBe(
      "1718452800000"
    );
  });

  test("keeps the request id a caller already sent", async () => {
    const response = await proxy(
      new NextRequest(`${ORIGIN}/api/health`, {
        headers: { "x-request-id": "upstream-42" },
      })
    );

    expect(response.headers.get("x-request-id")).toBe("upstream-42");
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      "upstream-42"
    );
  });

  test.each([
    "/api",
    "/api/health",
    "/api/orpc/category/create",
    "/api/docs/spec.json",
    "/api/cron/clean-up-blobs",
  ])(
    "never gives %s a language: it is stamped and passed through as it is",
    async (path) => {
      const outcome = await route(path);

      expect(outcome).toEqual({
        status: 200,
        redirectedTo: null,
        rewrittenTo: null,
        passedThrough: true,
        requestId: expect.stringMatching(UUID),
      });
    }
  );
});

describe("proxy: page requests", () => {
  test.each([
    ["/", "/es"],
    ["/products", "/es/products"],
    ["/products/chain-1?color=dorado", "/es/products/chain-1?color=dorado"],
    // Not a locale, so it is a Spanish path like any other (and a 404 there).
    ["/english", "/es/english"],
    ["/EN", "/es/EN"],
    // `/api` is a prefix only as a whole segment.
    ["/apiary", "/es/apiary"],
  ])(
    "serves %s in Spanish by rewriting it to %s, without a request id",
    async (path, rewritten) => {
      expect(await route(path)).toEqual({
        status: 200,
        redirectedTo: null,
        rewrittenTo: `${ORIGIN}${rewritten}`,
        passedThrough: false,
        requestId: null,
      });
    }
  );

  test.each(["/en", "/en/products", "/en/products?color=dorado"])(
    "lets %s through to its English route untouched",
    async (path) => {
      expect(await route(path)).toEqual({
        status: 200,
        redirectedTo: null,
        rewrittenTo: null,
        passedThrough: true,
        requestId: null,
      });
    }
  );

  test.each([
    ["/es", "/"],
    ["/es/", "/"],
    ["/es/products", "/products"],
    ["/es/products?color=dorado&page=2", "/products?color=dorado&page=2"],
    // Not an open redirect: the target stays a path on this origin.
    ["/es//evil.example/x", "/evil.example/x"],
  ])(
    "permanently redirects %s to %s, the one address of a Spanish page",
    async (path, target) => {
      expect(await route(path)).toEqual({
        status: 308,
        redirectedTo: `${ORIGIN}${target}`,
        rewrittenTo: null,
        passedThrough: false,
        requestId: null,
      });
    }
  );
});

describe("proxy: the launch switch", () => {
  const redirect = (target: string) => ({
    status: 307,
    redirectedTo: `${ORIGIN}${target}`,
    rewrittenTo: null,
    passedThrough: false,
    requestId: null,
  });

  /**
   * The switch's position and who asks: the public by default, or a request
   * the server vouches for as a signed-in admin's, or one whose check fails.
   */
  function setup({
    admin = false,
    closed = true,
  }: { admin?: boolean | Error; closed?: boolean } = {}) {
    mocks.isStorefrontClosed.mockResolvedValue(closed);
    if (admin instanceof Error) {
      mocks.isAdminRequest.mockRejectedValue(admin);
    } else {
      mocks.isAdminRequest.mockResolvedValue(admin);
    }
  }

  /** The notice's cookie as the response sets or clears it, or `null`. */
  async function previewCookie(
    path: string,
    headers: Record<string, string> = {}
  ) {
    const response = await proxy(
      new NextRequest(`${ORIGIN}${path}`, { headers })
    );

    return response.headers.get("set-cookie");
  }

  test.each([
    ["/", "/coming-soon"],
    ["/lr-market", "/coming-soon"],
    ["/lr-market/collar-de-perlas?color=dorado", "/coming-soon"],
    ["/es/lr-market", "/coming-soon"],
    ["/design", "/coming-soon"],
    // Only the admin itself stays open, not a page that starts like it.
    ["/administracion", "/coming-soon"],
    ["/en", "/en/coming-soon"],
    ["/en/lr-market/pearl-necklace?ref=qr", "/en/coming-soon"],
  ])(
    "closed, temporarily redirects %s to %s, in its language and without its query",
    async (path, target) => {
      setup();

      expect(await route(path)).toEqual(redirect(target));
    }
  );

  test.each([
    ["/coming-soon", "/es/coming-soon"],
    ["/admin", "/es/admin"],
    ["/admin/articles/new", "/es/admin/articles/new"],
  ])(
    "closed, still serves %s (rewritten to %s like any Spanish page)",
    async (path, rewritten) => {
      setup();

      expect(await route(path)).toMatchObject({
        status: 200,
        redirectedTo: null,
        rewrittenTo: `${ORIGIN}${rewritten}`,
      });
    }
  );

  test.each(["/en/coming-soon", "/en/admin", "/en/admin/orders"])(
    "closed, still lets %s through",
    async (path) => {
      setup();

      expect(await route(path)).toMatchObject({
        status: 200,
        redirectedTo: null,
        passedThrough: true,
      });
    }
  );

  test.each([
    "/api/health",
    "/api/orpc/category/create",
    "/api/auth/sign-in",
    // Vercel's cron calls it on production, which is closed until launch.
    "/api/cron/clean-up-blobs",
  ])("closed, never touches %s", async (path) => {
    setup();

    expect(await route(path)).toMatchObject({
      status: 200,
      redirectedTo: null,
      passedThrough: true,
    });
  });

  test.each([
    ["/coming-soon", "/"],
    ["/coming-soon?ref=qr", "/"],
    ["/es/coming-soon", "/"],
    ["/en/coming-soon", "/en"],
  ])("open, the coming-soon page %s leads home to %s", async (path, target) => {
    setup({ closed: false });

    expect(await route(path)).toEqual(redirect(target));
  });

  test.each(["/", "/productos/collar", "/en", "/design"])(
    "open, serves %s to the public without asking who they are",
    async (path) => {
      setup({ closed: false });

      expect(await route(path)).toMatchObject({ redirectedTo: null });
      expect(mocks.isAdminRequest).not.toHaveBeenCalled();
    }
  );

  test("closed, the redirect is kept by no cache: it depends on the switch and on who asks", async () => {
    setup();

    const response = await proxy(new NextRequest(`${ORIGIN}/productos`));

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test.each([
    ["/", "/es"],
    [
      "/productos/collar-de-perlas?color=dorado",
      "/es/productos/collar-de-perlas?color=dorado",
    ],
    ["/design", "/es/design"],
  ])(
    "closed, lets a signed-in admin see %s (rewritten to %s), and marks it for the notice",
    async (path, rewritten) => {
      setup({ admin: true });

      expect(
        await route(path, { cookie: "better-auth.session_token=t" })
      ).toEqual({
        status: 200,
        redirectedTo: null,
        rewrittenTo: `${ORIGIN}${rewritten}`,
        passedThrough: false,
        requestId: null,
      });
      expect(await previewCookie(path)).toBe(
        "lr-store-preview=1; Path=/; SameSite=lax"
      );
    }
  );

  test("closed, an admin reading English passes through in English", async () => {
    setup({ admin: true });

    expect(await route("/en/productos")).toMatchObject({
      passedThrough: true,
      redirectedTo: null,
    });
  });

  test("closed, the server decides who is an admin, from the request's own headers", async () => {
    setup({ admin: false });
    const headers = { cookie: "better-auth.session_token=forged" };

    // A session cookie the server does not vouch for opens nothing.
    expect(await route("/", headers)).toEqual(redirect("/coming-soon"));
    expect(mocks.isAdminRequest).toHaveBeenCalledExactlyOnceWith(
      expect.any(Headers)
    );
    expect(mocks.isAdminRequest.mock.calls[0]?.[0].get("cookie")).toBe(
      "better-auth.session_token=forged"
    );
  });

  test("closed, a session check that fails is reported and shows the coming-soon page", async () => {
    const outage = new Error("connection refused");
    setup({ admin: outage });

    expect(await route("/")).toEqual(redirect("/coming-soon"));
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      outage,
      { action: "ComingSoon.check_admin" }
    );
  });

  test("closed, a cookie set by hand opens nothing and is cleared", async () => {
    setup({ admin: false });

    expect(await route("/", { cookie: "lr-store-preview=1" })).toEqual(
      redirect("/coming-soon")
    );
    expect(await previewCookie("/", { cookie: "lr-store-preview=1" })).toBe(
      "lr-store-preview=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
  });

  test("open, the notice's cookie is cleared from a store page that still carries it", async () => {
    setup({ closed: false });

    expect(await previewCookie("/", { cookie: "lr-store-preview=1" })).toBe(
      "lr-store-preview=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
    // A page without it gets no cookie at all.
    expect(await previewCookie("/")).toBeNull();
  });

  test("the admin's pages leave the notice's cookie as it is and never read the switch", async () => {
    setup();

    expect(
      await previewCookie("/admin/settings/coming-soon", {
        cookie: "lr-store-preview=1",
      })
    ).toBeNull();
    expect(mocks.isStorefrontClosed).not.toHaveBeenCalled();
  });

  test("closed, the coming-soon page itself is shown to everyone, asking no one who they are", async () => {
    setup();

    expect(await route("/coming-soon")).toMatchObject({ redirectedTo: null });
    expect(mocks.isAdminRequest).not.toHaveBeenCalled();
  });

  test.each([
    ["/coming-soon", "/es/coming-soon"],
    ["/en/coming-soon", null],
  ])("open, a signed-in admin may preview %s", async (path, rewritten) => {
    setup({ admin: true, closed: false });

    expect(await route(path)).toMatchObject({
      redirectedTo: null,
      rewrittenTo: rewritten === null ? null : `${ORIGIN}${rewritten}`,
    });
    // A preview of the page is not the closed store: no notice.
    expect(await previewCookie(path)).toBeNull();
  });
});

describe("proxy matcher", () => {
  // Next compiles each matcher to a regular expression anchored at both ends.
  const matches = (pathname: string) =>
    config.matcher.some((source) => new RegExp(`^${source}$`).test(pathname));

  test.each([
    "/",
    "/en",
    "/products/chain-1",
    "/api/health",
    "/api/cron/clean-up-blobs",
    "/es/cart",
    // A dot does not make a path a file.
    "/products/pulsera-2.5mm",
    "/api/docs/spec.json",
    // A store's own llms.txt is a page-like route: it gets its language.
    "/lr-market/llms.txt",
    "/en/lr-market/llms.txt",
    // Only the root files are metadata routes, not a path that ends alike.
    "/lr-market/robots.txt",
    "/en/sitemap.xml",
    // A dot in the name is a dot, not any character.
    "/robots-txt",
    "/sitemap-xml",
    // Only the tunnel itself is skipped, not a page that starts like it.
    "/monitoring-pedidos",
    // Only the generated images and the brand folder, not pages named alike.
    "/icons",
    "/iconos/anillo",
    "/opengraph-image",
    "/es/opengraph-image/extra",
    "/fr/opengraph-image",
    "/brands",
    "/en/brand/lr-market-logo.svg",
    "/seeds",
    "/en/seed/ring-1.jpg",
    // The template's icon is gone: the tab icon is generated (`/icon`).
    "/favicon.ico",
  ])("runs on %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  test.each([
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/_vercel/insights/script.js",
    "/monitoring",
    "/monitoring/envelope",
    "/icon",
    "/apple-icon",
    "/brand/lr-market-logo.svg",
    "/seed/ring-1.jpg",
    "/robots.txt",
    "/sitemap.xml",
    // BotID's script and its checks, which `withBotId` rewrites to Vercel.
    "/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js",
    "/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/check",
  ])("stays off %s, which has no language", (pathname) => {
    expect(matches(pathname)).toBe(false);
  });

  test("stays off the share card of every language the product speaks", () => {
    expect(
      LOCALES.map((locale) => matches(`/${locale}/opengraph-image`))
    ).toEqual(LOCALES.map(() => false));
  });

  test("stays off every file in public/, which the proxy would otherwise rewrite into a 404", () => {
    const publicFiles = readdirSync(path.join(process.cwd(), "public"), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map(
        (entry) =>
          `/${path.relative("public", path.join(entry.parentPath, entry.name))}`
      );

    expect(publicFiles).toContain("/brand/lr-market-logo.svg");
    expect(publicFiles.filter((file) => matches(file))).toEqual([]);
  });
});
