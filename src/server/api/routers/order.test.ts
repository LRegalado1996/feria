import { call, ORPCError } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { orderRouter } from "./order";

// The router is input → storefront switch / store → service. The queries
// are `src/server/services/order.test.ts`'s and the access rules
// `src/server/services/access.test.ts`'s.

// The handle `withStoreAccess` hands its write: distinct from the client, so
// a write that went through the outer client instead would be caught.
const { TX } = vi.hoisted(() => ({
  TX: { handle: "the write's transaction" },
}));

const services = vi.hoisted(() => ({
  changeOrderStatus: vi.fn(async () => ({ id: 70, status: "packed" })),
  countOrders: vi.fn(async () => ({
    delivered: 2,
    packed: 0,
    received: 5,
    undeliverable: 1,
  })),
  createOrder: vi.fn(async () => ({ code: "ABCDE", token: "the-token" })),
  findAccessibleStore: vi.fn(),
  getActiveStoreBySlug: vi.fn(),
  getOrder: vi.fn(async () => ({ code: "ABCDE", id: 70 })),
  getOrderByToken: vi.fn(async () => ({ code: "ABCDE" })),
  // Vercel BotID's verdict; its own rules are `utils/bot-check.test.ts`'s.
  isBotRequest: vi.fn<() => Promise<boolean>>(),
  isStorefrontLaunchedFor: vi.fn(),
  listOrders: vi.fn(async () => ({ items: [{ id: 70 }], nextCursor: null })),
  // The request's wide-event logger: `set` is what lands on its log line.
  logSet: vi.fn<(fields: unknown) => void>(),
  // A keyed hash stands in for the real one: derived from the headers the
  // router hands it, so a key from anywhere else would show.
  orderClientKey: vi.fn((headers: Headers) => {
    const ip = headers.get("x-real-ip");
    return ip === null ? null : `key-of:${ip}`;
  }),
  withStoreAccess: vi.fn(
    async (
      _db: unknown,
      _scope: unknown,
      write: (handle: unknown) => Promise<unknown>
    ) => await write(TX)
  ),
}));

vi.mock("@/server/services/order", () => ({
  changeOrderStatus: services.changeOrderStatus,
  countOrders: services.countOrders,
  createOrder: services.createOrder,
  getOrder: services.getOrder,
  getOrderByToken: services.getOrderByToken,
  listOrders: services.listOrders,
}));

vi.mock("@/server/services/store", () => ({
  getActiveStoreBySlug: services.getActiveStoreBySlug,
}));

vi.mock("@/server/api/utils/client-key", () => ({
  orderClientKey: services.orderClientKey,
}));

vi.mock("@/server/api/utils/bot-check", () => ({
  isBotRequest: services.isBotRequest,
}));

vi.mock("@/server/api/utils/logger", () => ({
  safeRequestLogger: () => ({ set: services.logSet }),
}));

vi.mock("@/lib/env/launch", () => ({
  isStorefrontLaunchedFor: services.isStorefrontLaunchedFor,
  LAUNCH_OVERRIDE_HEADER: "x-e2e-storefront-launched",
}));

vi.mock("@/server/services/access", () => ({
  findAccessibleStore: services.findAccessibleStore,
  getUserRole: vi.fn(),
  withStoreAccess: services.withStoreAccess,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORE = { currencyCode: "USD", id: 7, slug: "lr-market" };
const ACCESS = { storeId: 7, userId: "test-user-id" };
const REQUEST_KEY = "11111111-1111-4111-8111-111111111111";
const TOKEN = "a".repeat(43);

function makeOrderInput(overrides: Record<string, unknown> = {}) {
  return {
    customerName: " Ana Pérez ",
    customerPhone: "099 123 456",
    items: [{ productId: 11, quantity: 2 }],
    locale: "es",
    note: "",
    requestKey: REQUEST_KEY,
    storeSlug: "lr-market",
    ...overrides,
  };
}

/**
 * A caller: a shopper by default (signed out), or a member who may work on
 * `lr-market`. The storefront is open and `lr-market` active unless told not.
 */
function setup({
  bot = false,
  headers = {},
  launched = true,
  mayWork = true,
  signedIn = false,
  storeActive = true,
}: {
  bot?: boolean;
  headers?: Record<string, string>;
  launched?: boolean;
  mayWork?: boolean;
  signedIn?: boolean;
  storeActive?: boolean;
} = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  mockCtx.headers = new Headers(headers);
  services.isStorefrontLaunchedFor.mockReturnValue(launched);
  services.isBotRequest.mockResolvedValue(bot);
  services.findAccessibleStore.mockResolvedValue(mayWork ? STORE : null);
  services.getActiveStoreBySlug.mockImplementation(
    async (_db: unknown, { slug }: { slug: string }) => {
      if (storeActive && slug === STORE.slug) {
        return await Promise.resolve(STORE);
      }

      throw new ORPCError("NOT_FOUND", { message: "Store not found" });
    }
  );
  const options = { context: mockCtx as never };
  const procedures = {
    changeStatus: async (input: unknown) =>
      await call(orderRouter.changeStatus, input as never, options),
    counts: async (input: unknown) =>
      await call(orderRouter.counts, input as never, options),
    create: async (input: unknown) =>
      await call(orderRouter.create, input as never, options),
    get: async (input: unknown) =>
      await call(orderRouter.get, input as never, options),
    getByToken: async (input: unknown) =>
      await call(orderRouter.getByToken, input as never, options),
    list: async (input: unknown) =>
      await call(orderRouter.list, input as never, options),
  };
  const run = async (name: keyof typeof procedures, input: unknown) =>
    await procedures[name](input);

  return { ctx: mockCtx, db: mockCtx.db, run };
}

/**
 * What the router set on the request's log line under `order`; the shared
 * interceptor's own `orpc` timing goes through the same logger.
 */
function orderLogFields() {
  return services.logSet.mock.calls.flatMap(([fields]) =>
    typeof fields === "object" && fields !== null && "order" in fields
      ? [fields]
      : []
  );
}

const STORE_NOT_FOUND = { code: "NOT_FOUND", message: "Store not found" };

describe("order router: the shopper's side", () => {
  test("creates the order in the active store, its currency and client key from the server", async () => {
    const { ctx, db, run } = setup({
      headers: {
        "x-e2e-storefront-launched": "true",
        "x-real-ip": "203.0.113.7",
      },
    });

    await expect(
      run("create", makeOrderInput({ items: [{ productId: 11, quantity: 2 }] }))
    ).resolves.toEqual({ code: "ABCDE", token: "the-token" });

    expect(services.isStorefrontLaunchedFor).toHaveBeenCalledExactlyOnceWith(
      "true"
    );
    expect(services.getActiveStoreBySlug).toHaveBeenCalledExactlyOnceWith(db, {
      slug: "lr-market",
    });
    expect(services.orderClientKey).toHaveBeenCalledExactlyOnceWith(
      ctx.headers
    );
    // With a client key, both limits apply: nothing to flag.
    expect(orderLogFields()).toEqual([]);
    // No currency: the service reads the store's own under its lock.
    expect(services.createOrder).toHaveBeenCalledExactlyOnceWith(db, {
      clientKey: "key-of:203.0.113.7",
      storeId: 7,
      values: {
        customerName: "Ana Pérez",
        customerPhone: "+59899123456",
        items: [{ productId: 11, quantity: 2 }],
        locale: "es",
        note: null,
        requestKey: REQUEST_KEY,
      },
    });
  });

  test.each([
    [
      "a price",
      { items: [{ productId: 11, quantity: 2, unitPriceAmount: 1 }] },
    ],
    ["a total", { totalAmount: 1 }],
    ["a currency", { currencyCode: "UYU" }],
    ["a store id", { storeId: 99 }],
    ["a client key", { clientKey: "forged" }],
  ])(
    "refuses a request carrying %s as tampered, before reading anything",
    async (_what, forged) => {
      const { run } = setup({
        headers: { "x-e2e-storefront-launched": "true" },
      });

      await expect(run("create", makeOrderInput(forged))).rejects.toMatchObject(
        { code: "BAD_REQUEST" }
      );
      expect(services.getActiveStoreBySlug).not.toHaveBeenCalled();
      expect(services.createOrder).not.toHaveBeenCalled();
    }
  );

  test("creates with no client key when the platform gave no IP", async () => {
    const { db, run } = setup();

    await run("create", makeOrderInput());

    expect(services.isStorefrontLaunchedFor).toHaveBeenCalledExactlyOnceWith(
      null
    );
    expect(services.createOrder).toHaveBeenCalledExactlyOnceWith(
      db,
      expect.objectContaining({ clientKey: null })
    );
    // The per-client limit failed open: the request's log line says so.
    expect(orderLogFields()).toEqual([{ order: { clientLimit: "skipped" } }]);
  });

  test("a closed storefront takes no order, before resolving the store", async () => {
    const { run } = setup({ launched: false });

    await expect(run("create", makeOrderInput())).rejects.toMatchObject(
      STORE_NOT_FOUND
    );
    expect(services.getActiveStoreBySlug).not.toHaveBeenCalled();
    expect(services.createOrder).not.toHaveBeenCalled();
    // Closed answers the same to everyone: no bot check is spent on it.
    expect(services.isBotRequest).not.toHaveBeenCalled();
  });

  test("refuses an order BotID judges a bot's, before reading the store or anything else", async () => {
    const { db, run } = setup({
      bot: true,
      headers: { "x-real-ip": "203.0.113.7" },
    });

    await expect(run("create", makeOrderInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Request refused",
    });
    expect(services.getActiveStoreBySlug).not.toHaveBeenCalled();
    expect(services.orderClientKey).not.toHaveBeenCalled();
    expect(services.createOrder).not.toHaveBeenCalled();
    expect(db.$.select).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("an order BotID judges a person's goes through as before", async () => {
    const { db, run } = setup({ bot: false });

    await expect(run("create", makeOrderInput())).resolves.toEqual({
      code: "ABCDE",
      token: "the-token",
    });
    expect(services.isBotRequest).toHaveBeenCalledExactlyOnceWith();
    expect(services.createOrder).toHaveBeenCalledExactlyOnceWith(
      db,
      expect.objectContaining({ storeId: 7 })
    );
  });

  test.each([
    ["create", makeOrderInput(), services.createOrder],
    [
      "getByToken",
      { storeSlug: "lr-market", token: TOKEN },
      services.getOrderByToken,
    ],
  ] as const)(
    "%s on an inactive or unknown store is NOT_FOUND, before the service",
    async (name, input, service) => {
      const { run } = setup({ storeActive: false });

      await expect(run(name, input)).rejects.toMatchObject(STORE_NOT_FOUND);
      expect(service).not.toHaveBeenCalled();
    }
  );

  test("reads an order by its token within the resolved store", async () => {
    const { db, run } = setup();

    await expect(
      run("getByToken", { storeSlug: "lr-market", token: TOKEN })
    ).resolves.toEqual({ code: "ABCDE" });

    expect(services.getActiveStoreBySlug).toHaveBeenCalledExactlyOnceWith(db, {
      slug: "lr-market",
    });
    expect(services.getOrderByToken).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
      token: TOKEN,
    });
  });

  test.each([
    ["create", makeOrderInput({ customerPhone: "24001234" })],
    ["create", makeOrderInput({ items: [{ productId: 11, quantity: 11 }] })],
    ["getByToken", { storeSlug: "lr-market", token: "a".repeat(42) }],
  ] as const)(
    "refuses invalid %s input before resolving the store",
    async (name, input) => {
      const { run } = setup();

      await expect(run(name, input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      expect(services.getActiveStoreBySlug).not.toHaveBeenCalled();
    }
  );
});

describe("order router: the store's side", () => {
  test("lists the resolved store's orders with the cursor and status, outside any write", async () => {
    const { db, run } = setup({ signedIn: true });

    await expect(
      run("list", {
        cursor: { createdAt: "2026-11-15T10:00:00.000Z", id: "40" },
        status: "packed",
        storeSlug: "lr-market",
      })
    ).resolves.toEqual({ items: [{ id: 70 }], nextCursor: null });

    expect(services.findAccessibleStore).toHaveBeenCalledExactlyOnceWith(db, {
      slug: "lr-market",
      userId: "test-user-id",
    });
    expect(services.listOrders).toHaveBeenCalledExactlyOnceWith(db, {
      cursor: { createdAt: new Date("2026-11-15T10:00:00.000Z"), id: 40 },
      status: "packed",
      storeId: 7,
    });
    expect(services.withStoreAccess).not.toHaveBeenCalled();
  });

  test.each([
    ["  José  ", "José"],
    ["   ", undefined],
  ])("lists with the search %j sent as %j", async (q, expected) => {
    const { db, run } = setup({ signedIn: true });

    await run("list", { q, storeSlug: "lr-market" });

    expect(services.listOrders).toHaveBeenCalledExactlyOnceWith(db, {
      cursor: undefined,
      q: expected,
      status: undefined,
      storeId: 7,
    });
  });

  test("counts the resolved store's orders per status, outside any write", async () => {
    const { db, run } = setup({ signedIn: true });

    await expect(run("counts", { storeSlug: "lr-market" })).resolves.toEqual({
      delivered: 2,
      packed: 0,
      received: 5,
      undeliverable: 1,
    });

    expect(services.findAccessibleStore).toHaveBeenCalledExactlyOnceWith(db, {
      slug: "lr-market",
      userId: "test-user-id",
    });
    expect(services.countOrders).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
    });
    expect(services.withStoreAccess).not.toHaveBeenCalled();
  });

  test("gets one order by id within the resolved store", async () => {
    const { db, run } = setup({ signedIn: true });

    await expect(
      run("get", { id: "70", storeSlug: "lr-market" })
    ).resolves.toEqual({ code: "ABCDE", id: 70 });

    expect(services.getOrder).toHaveBeenCalledExactlyOnceWith(db, {
      id: 70,
      storeId: 7,
    });
  });

  test("moves an order inside the access check, as the session's user", async () => {
    const { db, run } = setup({ signedIn: true });

    await expect(
      run("changeStatus", {
        id: "70",
        status: "packed",
        storeSlug: "lr-market",
      })
    ).resolves.toEqual({ id: 70, status: "packed" });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.changeOrderStatus).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 70,
      status: "packed",
      storeId: 7,
      userId: "test-user-id",
    });
  });

  test.each([
    ["list", { storeSlug: "tienda-demo" }, services.listOrders],
    ["counts", { storeSlug: "tienda-demo" }, services.countOrders],
    ["get", { id: 70, storeSlug: "tienda-demo" }, services.getOrder],
    [
      "changeStatus",
      { id: 70, status: "packed", storeSlug: "tienda-demo" },
      services.changeOrderStatus,
    ],
  ] as const)(
    "%s on a store the caller may not work on is NOT_FOUND, before the service",
    async (name, input, service) => {
      const { run } = setup({ mayWork: false, signedIn: true });

      await expect(run(name, input)).rejects.toMatchObject(STORE_NOT_FOUND);
      expect(services.withStoreAccess).not.toHaveBeenCalled();
      expect(service).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["list", { storeSlug: "lr-market" }],
    ["counts", { storeSlug: "lr-market" }],
    ["get", { id: 70, storeSlug: "lr-market" }],
    ["changeStatus", { id: 70, status: "packed", storeSlug: "lr-market" }],
  ] as const)(
    "%s from a signed-out caller is UNAUTHORIZED, before the store is resolved",
    async (name, input) => {
      const { run } = setup();

      await expect(run(name, input)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
      expect(services.findAccessibleStore).not.toHaveBeenCalled();
    }
  );

  test("refuses an unknown status before resolving the store", async () => {
    const { run } = setup({ signedIn: true });

    await expect(
      run("changeStatus", {
        id: 70,
        status: "cancelled",
        storeSlug: "lr-market",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(services.findAccessibleStore).not.toHaveBeenCalled();
    expect(services.changeOrderStatus).not.toHaveBeenCalled();
  });
});
