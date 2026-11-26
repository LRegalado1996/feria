import { readdirSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { StoreAddresses } from "@/lib/catalog/store-address";
import { LOCALES } from "@/lib/i18n/config";
import type * as StorefrontSwitch from "@/server/cache/storefront-switch";
import { SWITCH_TIMEOUT_MS } from "@/server/cache/storefront-switch";

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
  // Unread unless a test gives the store addresses: every request goes on.
  currentStoreAddresses: vi.fn<() => Promise<StoreAddresses | null>>(
    async () => await Promise.resolve(null)
  ),
  storeAddressesSince: vi.fn<(time: number) => Promise<StoreAddresses | null>>(
    async () => await Promise.resolve(null)
  ),
}));

// The book's windows and shared reads are `store-addresses.test.ts`'s; the
// rule each address follows is `store-address.test.ts`'s.
vi.mock("@/server/cache/store-addresses", () => ({
  currentStoreAddresses: mocks.currentStoreAddresses,
  storeAddressesSince: mocks.storeAddressesSince,
}));

// The switch's own read and its fail-safe are `storefront-switch.test.ts`'s;
// the session check is `admin-request.test.ts`'s. The time limit stays real.
vi.mock("@/server/cache/storefront-switch", async (importOriginal) => ({
  ...(await importOriginal<typeof StorefrontSwitch>()),
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

describe("proxy: the store's addresses", () => {
  const ARRIVED = new Date("2026-11-25T12:00:00.000Z");
  const UNKNOWN = "/__unknown__/__unknown__/__unknown__";

  /** A store with a group and its category, the home and a draft. */
  function makeAddresses(
    overrides: Partial<StoreAddresses> = {}
  ): StoreAddresses {
    return {
      categories: [
        { path: "/bijouterie", slug: "bijouterie" },
        { path: "/bijouterie/anillos", slug: "anillos" },
      ],
      pages: [
        { isHome: true, isPublished: true, slug: "home" },
        { isHome: false, isPublished: false, slug: "ofertas" },
      ],
      ...overrides,
    };
  }

  /**
   * The store open, the public asking (or an admin, or a check that
   * fails), the addresses the proxy kept and those a new read finds, at a
   * fixed time.
   */
  function setup({
    admin = false,
    closed = false,
    fresh = makeAddresses(),
    kept = makeAddresses(),
  }: {
    admin?: boolean | Error;
    closed?: boolean;
    fresh?: StoreAddresses | null;
    kept?: StoreAddresses | null;
  } = {}) {
    vi.setSystemTime(ARRIVED);
    mocks.isStorefrontClosed.mockResolvedValue(closed);
    mocks.currentStoreAddresses.mockResolvedValue(kept);
    mocks.storeAddressesSince.mockResolvedValue(fresh);
    if (admin instanceof Error) {
      mocks.isAdminRequest.mockRejectedValue(admin);
    } else {
      mocks.isAdminRequest.mockResolvedValue(admin);
    }
  }

  /** What the proxy did, with the cache rule it set. */
  async function answer(path: string, headers: Record<string, string> = {}) {
    const response = await proxy(
      new NextRequest(`${ORIGIN}${path}`, { headers })
    );

    return {
      cacheControl: response.headers.get("cache-control"),
      redirectedTo: response.headers.get("location"),
      rewrittenTo: response.headers.get("x-middleware-rewrite"),
      status: "status" in response ? response.status : null,
    };
  }

  // The other blocks' requests go on, as with addresses never read.
  afterEach(() => {
    mocks.currentStoreAddresses.mockResolvedValue(null);
    mocks.storeAddressesSince.mockResolvedValue(null);
  });

  const notFound = (locale: string) => ({
    cacheControl: "private, no-store",
    redirectedTo: null,
    rewrittenTo: `${ORIGIN}/${locale}${UNKNOWN}`,
    status: 200,
  });

  test.each([
    ["/no-such-page", "es"],
    ["/no-such-page?color=dorado", "es"],
    ["/bijouterie/no-such", "es"],
    ["/en/no-such-page", "en"],
    ["/en/bijouterie/no-such", "en"],
  ])(
    "sends %s, which names nothing, to the not-found page in its language, which no cache keeps",
    async (path, locale) => {
      setup();

      expect(await answer(path)).toEqual(notFound(locale));
    }
  );

  test("decides an unknown address on a read that started once the request arrived, never on the kept one", async () => {
    setup();

    await answer("/no-such-page");

    expect(mocks.storeAddressesSince).toHaveBeenCalledExactlyOnceWith(
      ARRIVED.getTime()
    );
  });

  test("lets a page or a category the kept addresses know go on to its route, reading nothing new", async () => {
    setup({ fresh: null });

    for (const [path, rewritten] of [
      ["/bijouterie", "/es/bijouterie"],
      [
        "/bijouterie/anillos?color=dorado",
        "/es/bijouterie/anillos?color=dorado",
      ],
    ] as const) {
      expect(await answer(path)).toEqual({
        cacheControl: null,
        redirectedTo: null,
        rewrittenTo: `${ORIGIN}${rewritten}`,
        status: 200,
      });
    }

    expect(await answer("/en/bijouterie")).toMatchObject({
      rewrittenTo: null,
      status: 200,
    });
    expect(mocks.storeAddressesSince).not.toHaveBeenCalled();
  });

  test("lets through a category made after the kept read, which the new read finds", async () => {
    setup({
      fresh: makeAddresses({
        categories: [{ path: "/nueva", slug: "nueva" }],
      }),
    });

    expect(await answer("/nueva")).toEqual({
      cacheControl: null,
      redirectedTo: null,
      rewrittenTo: `${ORIGIN}/es/nueva`,
      status: 200,
    });
  });

  test("lets through a page the kept read thought was the home, once the new read says it no longer is", async () => {
    setup({
      fresh: makeAddresses({
        pages: [{ isHome: false, isPublished: true, slug: "home" }],
      }),
    });

    expect(await answer("/home")).toMatchObject({
      redirectedTo: null,
      rewrittenTo: `${ORIGIN}/es/home`,
    });
  });

  test.each([
    ["/home", "/"],
    ["/home?ref=ig", "/"],
    ["/en/home", "/en"],
  ])(
    "sends %s, the home's own address, to %s for now (307), its query dropped",
    async (path, target) => {
      setup();

      expect(await answer(path)).toEqual({
        cacheControl: "private, no-store",
        redirectedTo: `${ORIGIN}${target}`,
        rewrittenTo: null,
        status: 307,
      });
    }
  );

  test.each([
    ["/anillos", "/bijouterie/anillos"],
    ["/anillos?sort=price_asc", "/bijouterie/anillos?sort=price_asc"],
    ["/otro/anillos", "/bijouterie/anillos"],
    ["/en/anillos?sort=price_asc", "/en/bijouterie/anillos?sort=price_asc"],
  ])(
    "sends %s, a category outside its group, to %s for good (308), its query kept",
    async (path, target) => {
      setup();

      expect(await answer(path)).toEqual({
        cacheControl: "private, no-store",
        redirectedTo: `${ORIGIN}${target}`,
        rewrittenTo: null,
        status: 308,
      });
    }
  );

  test("a draft is the not-found page for the public, asking the server who they are", async () => {
    setup();

    expect(
      await answer("/ofertas", { cookie: "better-auth.session_token=x" })
    ).toEqual(notFound("es"));
    expect(mocks.isAdminRequest).toHaveBeenCalledExactlyOnceWith(
      expect.any(Headers)
    );
    expect(mocks.isAdminRequest.mock.calls[0]?.[0].get("cookie")).toBe(
      "better-auth.session_token=x"
    );
  });

  test("a draft goes on to its route for a signed-in admin, who previews it", async () => {
    setup({ admin: true });

    expect(await answer("/ofertas")).toEqual({
      cacheControl: null,
      redirectedTo: null,
      rewrittenTo: `${ORIGIN}/es/ofertas`,
      status: 200,
    });
  });

  test("a draft is the not-found page when the admin check fails, which is reported", async () => {
    const outage = new Error("connection refused");
    setup({ admin: outage });

    expect(await answer("/ofertas")).toEqual(notFound("es"));
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      outage,
      { action: "ComingSoon.check_admin" }
    );
  });

  test.each([
    ["the addresses were never read", null, null],
    ["the new read failed", makeAddresses(), null],
  ])(
    "lets an address through to its route when %s",
    async (_case, kept, fresh) => {
      setup({ fresh, kept });

      expect(await answer("/no-such-page")).toEqual({
        cacheControl: null,
        redirectedTo: null,
        rewrittenTo: `${ORIGIN}/es/no-such-page`,
        status: 200,
      });
    }
  );

  test.each([
    "/",
    "/en",
    "/productos",
    "/productos/anillo-sello",
    "/contacto",
    "/cart",
    "/orders/abc",
    "/a/b/c",
    "/admin",
    "/admin/orders",
  ])(
    "never reads the addresses for %s, which a route of its own answers",
    async (path) => {
      setup();

      await answer(path);

      expect(mocks.currentStoreAddresses).not.toHaveBeenCalled();
    }
  );

  test("sends `/es/...` to its one address first, without reading the addresses", async () => {
    setup();

    expect(await answer("/es/no-such-page")).toMatchObject({
      redirectedTo: `${ORIGIN}/no-such-page`,
      status: 308,
    });
    expect(mocks.currentStoreAddresses).not.toHaveBeenCalled();
  });

  test("closed, the public goes to the coming-soon page before any address is read", async () => {
    setup({ closed: true });

    expect(await answer("/no-such-page")).toMatchObject({
      redirectedTo: `${ORIGIN}/coming-soon`,
      status: 307,
    });
    expect(mocks.currentStoreAddresses).not.toHaveBeenCalled();
  });

  test("closed, an admin's unknown address is the not-found page with the notice's cookie", async () => {
    setup({ admin: true, closed: true });

    const response = await proxy(new NextRequest(`${ORIGIN}/no-such-page`));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `${ORIGIN}/es${UNKNOWN}`
    );
    expect(response.headers.get("set-cookie")).toBe(
      "lr-store-preview=1; Path=/; SameSite=lax"
    );
  });
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

  test("closed, an admin check answering just inside the switch's time limit lets the admin in", async () => {
    vi.useFakeTimers();
    setup();
    mocks.isAdminRequest.mockImplementationOnce(
      async () =>
        await new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, SWITCH_TIMEOUT_MS - 1);
        })
    );

    const routed = route("/");
    await vi.advanceTimersByTimeAsync(SWITCH_TIMEOUT_MS - 1);

    expect(await routed).toMatchObject({
      passedThrough: false,
      rewrittenTo: `${ORIGIN}/es`,
    });
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("closed, an admin check that outlasts the switch's time limit is reported and shows the coming-soon page", async () => {
    vi.useFakeTimers();
    setup();
    mocks.isAdminRequest.mockImplementationOnce(
      async () => await new Promise<boolean>(() => {})
    );

    const routed = route("/");
    await vi.advanceTimersByTimeAsync(SWITCH_TIMEOUT_MS - 1);
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(await routed).toEqual(redirect("/coming-soon"));
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      new Error(`The admin session check took over ${SWITCH_TIMEOUT_MS} ms`),
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
    // Only the icons' own addresses, not the paths they once had nor ones
    // that end alike.
    "/icon",
    "/apple-icon",
    "/icon-png",
    "/en/favicon.ico",
    // Only a 32-hex-character name at the root is a key file, not a store's
    // llms.txt nor a shorter or longer name.
    "/239a2df8583d65e79cf2271b09b4c09.txt",
    "/239a2df8583d65e79cf2271b09b4c09c0.txt",
    "/en/239a2df8583d65e79cf2271b09b4c09c.txt",
    "/239A2DF8583D65E79CF2271B09B4C09C.txt",
    "/productos/icon.png",
  ])("runs on %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  test.each([
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/_vercel/insights/script.js",
    "/monitoring",
    "/monitoring/envelope",
    "/favicon.ico",
    "/icon.png",
    "/apple-icon.png",
    "/brand/lr-market-logo.svg",
    "/seed/ring-1.jpg",
    "/robots.txt",
    "/sitemap.xml",
    "/239a2df8583d65e79cf2271b09b4c09c.txt",
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
