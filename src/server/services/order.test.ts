import type * as NodeCrypto from "node:crypto";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ORDER_CODE_ALPHABET,
  ORDER_TOKEN_PATTERN,
  type OrderStatus,
} from "@/lib/schemas/order";
import {
  customerOrder,
  orderItem,
  orderStatusEvent,
  product,
  productTranslation,
  user,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  changeOrderStatus,
  createOrder,
  generateOrderCode,
  generateOrderToken,
  getOrder,
  getOrderByToken,
  listOrders,
  maskPhone,
} from "./order";

// `randomInt` picks the code's characters: a spy over the real one, so a
// test can pin the code and every other test still gets real randomness.
const { crypto, randomInt } = vi.hoisted(() => ({
  crypto: { realRandomInt: (_max: number): number => 0 },
  randomInt: vi.fn<(max: number) => number>(),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();
  crypto.realRandomInt = (max: number) => actual.randomInt(max);
  randomInt.mockImplementation(crypto.realRandomInt);

  return { ...actual, randomInt };
});

// A test that pins the draws hands the real `randomInt` back.
afterEach(() => {
  randomInt.mockImplementation(crypto.realRandomInt);
});

const STORE_ID = 3;
const PHONE = "+59899123456";
const CLIENT_KEY = "client-key-hash";
const REQUEST_KEY = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-15T12:00:00.000Z");
const HOUR_AGO = new Date("2026-11-15T11:00:00.000Z");

const REQUEST_SQL =
  '("customer_order"."storeId" = $1 and "customer_order"."requestKey" = $2)';
const PHONE_HOUR_SQL =
  '("customer_order"."customerPhone" = $1 and "customer_order"."createdAt" > $2)';
const CLIENT_HOUR_SQL =
  '("customer_order"."clientKey" = $1 and "customer_order"."createdAt" > $2)';
const ARTICLES_SQL =
  '("product"."id" in ($1, $2) and "product"."storeId" = $3 and "product"."status" = $4)';
const TITLES_SQL = '"product_translation"."productId" in ($1, $2)';
const CODE_SQL =
  '("customer_order"."storeId" = $1 and "customer_order"."code" = $2)';
const LOCK_SQL = "select pg_advisory_xact_lock(hashtext($1))";
const CLOCK_SQL = "select clock_timestamp() as now";

/** `minutes` after an hour ago: an order still inside the window. */
function minutesIntoWindow(minutes: number) {
  return { createdAt: new Date(HOUR_AGO.getTime() + minutes * 60_000) };
}

function makeArticle(overrides: Record<string, unknown> = {}) {
  return { id: 11, isAvailable: true, priceAmount: 69_000, ...overrides };
}

function makeValues(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Ana Pérez",
    customerPhone: PHONE,
    items: [
      { productId: 11, quantity: 2 },
      { productId: 12, quantity: 1 },
    ],
    locale: "es" as const,
    note: null as string | null,
    requestKey: REQUEST_KEY,
    ...overrides,
  };
}

/**
 * The mock database answering `createOrder`'s queries by the SQL they send:
 * - `already`: the order an earlier submit with this request key created;
 * - `phoneTimes` / `clientTimes`: the last hour's orders of the phone and of
 *   the client, oldest first;
 * - `articles` / `titles`: what the store's orderable articles hold;
 * - `takenCodes`: the codes the store already used;
 * - `created`: what the order insert returns (`null`: no row);
 * - `clock`: what `clock_timestamp()` answers (`null`: no row).
 */
function setup({
  already = null,
  articles = [makeArticle(), makeArticle({ id: 12, priceAmount: 129_000 })],
  clientTimes = [],
  clock = NOW,
  created = { code: "33333", id: 70, token: "the-token" },
  phoneTimes = [],
  takenCodes = [],
  titles = [],
}: {
  already?: { code: string; customerPhone: string; token: string } | null;
  articles?: ReturnType<typeof makeArticle>[];
  clientTimes?: { createdAt: Date }[];
  clock?: Date | string | null;
  created?: { code: string; id: number; token: string } | null;
  phoneTimes?: { createdAt: Date }[];
  takenCodes?: string[];
  titles?: { locale: string; productId: number; title: string }[];
} = {}) {
  const db = createMockDatabase();
  const lastWhere = () =>
    renderQuery(db.$["select.where"].mock.calls.at(-1)?.[0]);

  db.$["select.where"].mockImplementation(async (where: unknown) => {
    const { params, sql } = renderQuery(where);

    if (sql === REQUEST_SQL && params[0] === STORE_ID) {
      return await Promise.resolve(already ? [already] : []);
    }

    if (sql === TITLES_SQL) {
      return await Promise.resolve(titles);
    }

    if (
      sql === CODE_SQL &&
      params[0] === STORE_ID &&
      takenCodes.includes(params[1] as string)
    ) {
      return await Promise.resolve([{ id: 1 }]);
    }

    return await Promise.resolve([]);
  });
  db.$["select.orderBy"].mockImplementation(async () => {
    const { params, sql } = lastWhere();

    if (sql === PHONE_HOUR_SQL && params[0] === PHONE) {
      return await Promise.resolve(phoneTimes);
    }

    if (sql === CLIENT_HOUR_SQL && params[0] === CLIENT_KEY) {
      return await Promise.resolve(clientTimes);
    }

    return await Promise.resolve([]);
  });
  db.$["select.for"].mockImplementation(async () =>
    lastWhere().sql === ARTICLES_SQL
      ? await Promise.resolve(articles)
      : await Promise.resolve([])
  );
  db.$["insert.returning"].mockResolvedValue(created ? [created] : []);
  // The locks answer nothing; the clock answers its row, or none.
  db.$.execute.mockImplementation(async (query: unknown) =>
    renderQuery(query).sql === CLOCK_SQL
      ? await Promise.resolve({ rows: clock === null ? [] : [{ now: clock }] })
      : await Promise.resolve(null)
  );

  /** Places the order; `now: null` leaves the time to the database. */
  const create = async ({
    clientKey = CLIENT_KEY,
    now = NOW,
    values = makeValues(),
  }: {
    clientKey?: string | null;
    now?: Date | null;
    values?: ReturnType<typeof makeValues>;
  } = {}) =>
    await createOrder(db as never, {
      clientKey,
      currencyCode: "UYU",
      ...(now === null ? {} : { now }),
      storeId: STORE_ID,
      values,
    });
  const selectWheres = () =>
    db.$["select.where"].mock.calls.map(([where]) => renderQuery(where));
  const statements = () =>
    db.$.execute.mock.calls.map(([query]) => renderQuery(query));

  return { create, db, selectWheres, statements };
}

describe("generateOrderToken", () => {
  test("is 43 base64url characters, a new one each time", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateOrderToken())
    );

    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(ORDER_TOKEN_PATTERN);
    }
  });
});

describe("generateOrderCode", () => {
  test("takes five characters from the alphabet, one draw each", () => {
    const draws = [0, 30, 8, 9, 15];
    randomInt.mockImplementation(() => draws.shift() ?? 0);

    expect(generateOrderCode()).toBe("2ZABH");
    expect(randomInt.mock.calls).toEqual([[31], [31], [31], [31], [31]]);
  });

  test("never draws a look-alike", () => {
    const codes = Array.from({ length: 200 }, () => generateOrderCode());

    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}$/u);
    }
    expect(ORDER_CODE_ALPHABET).toBe("23456789ABCDEFGHJKMNPQRSTUVWXYZ");
  });
});

describe("maskPhone", () => {
  test.each([
    ["a Uruguayan number keeps +598", "+59899123456", "+598•••••456"],
    // Country codes run 1 to 3 digits: only the `+` is sure to be one.
    ["another country keeps only +", "+5491123456789", "+••••••••••789"],
    ["a one-digit country keeps only +", "+12025550123", "+••••••••123"],
    ["the shortest phone we accept", "+12345678", "+•••••678"],
    ["a number with nothing to hide", "+123", "+123"],
  ])("%s: %s is %s", (_case, phone, masked) => {
    expect(maskPhone(phone)).toBe(masked);
  });
});

describe("createOrder", () => {
  test("locks the phone, the client, then the store, before reading anything", async () => {
    const { create, db, statements } = setup();

    await create();

    expect(statements()).toEqual([
      { params: [`order.phone:${PHONE}`], sql: LOCK_SQL },
      { params: [`order.client:${CLIENT_KEY}`], sql: LOCK_SQL },
      { params: [`order.store:${String(STORE_ID)}`], sql: LOCK_SQL },
    ]);
    expect(db.$.execute.mock.invocationCallOrder[2] ?? Infinity).toBeLessThan(
      db.$["select.where"].mock.invocationCallOrder[0] ?? 0
    );
    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
  });

  test("takes no client lock when the platform gave no IP", async () => {
    const { create, statements } = setup();

    await create({ clientKey: null });

    expect(statements()).toEqual([
      { params: [`order.phone:${PHONE}`], sql: LOCK_SQL },
      { params: [`order.store:${String(STORE_ID)}`], sql: LOCK_SQL },
    ]);
  });

  test.each([
    ["a timestamp text", "2026-11-15T13:30:00.000Z"],
    ["a Date", new Date("2026-11-15T13:30:00.000Z")],
  ])(
    "reads the database's clock after the locks, as %s, for the windows and the stamps",
    async (_case, clock) => {
      const { create, db, selectWheres, statements } = setup({ clock });

      await create({ now: null });

      expect(statements().slice(3)).toEqual([{ params: [], sql: CLOCK_SQL }]);
      // An hour before the database's now, not the app server's.
      expect(selectWheres().slice(1, 3)).toEqual([
        { params: [PHONE, "2026-11-15T12:30:00.000Z"], sql: PHONE_HOUR_SQL },
        {
          params: [CLIENT_KEY, "2026-11-15T12:30:00.000Z"],
          sql: CLIENT_HOUR_SQL,
        },
      ]);
      const stamped = new Date("2026-11-15T13:30:00.000Z");
      expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
        createdAt: stamped,
      });
      expect(db.$["insert.values"].mock.calls[2]?.[0]).toEqual({
        changedById: null,
        createdAt: stamped,
        orderId: 70,
        status: "received",
      });
    }
  );

  test("reads no clock when the moment is given", async () => {
    const { create, statements } = setup({ clock: null });

    await create();

    expect(statements().filter(({ sql }) => sql === CLOCK_SQL)).toEqual([]);
  });

  test("fails loudly when the database gives no time, reading nothing", async () => {
    const { create, db } = setup({ clock: null });

    await expect(create({ now: null })).rejects.toThrow(
      "The database gave no time"
    );
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("refuses a request key another phone already used, never answering its order", async () => {
    const { create, db } = setup({
      already: {
        code: "ABCDE",
        customerPhone: "+59898765432",
        token: "earlier-token",
      },
    });

    await expect(create()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That request was already used for another order",
    });
    expect(db.$["select.orderBy"]).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("answers the order a request key already created, before any limit", async () => {
    const { create, db, selectWheres } = setup({
      already: { code: "ABCDE", customerPhone: PHONE, token: "earlier-token" },
      phoneTimes: Array.from({ length: 5 }, () => minutesIntoWindow(1)),
    });

    await expect(create()).resolves.toEqual({
      code: "ABCDE",
      token: "earlier-token",
    });
    expect(selectWheres()).toEqual([
      { params: [STORE_ID, REQUEST_KEY], sql: REQUEST_SQL },
    ]);
    expect(db.$["select.orderBy"]).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("counts the phone's and the client's last hour, oldest first", async () => {
    const { create, db, selectWheres } = setup();

    await create();

    expect(selectWheres().slice(1, 3)).toEqual([
      { params: [PHONE, HOUR_AGO.toISOString()], sql: PHONE_HOUR_SQL },
      { params: [CLIENT_KEY, HOUR_AGO.toISOString()], sql: CLIENT_HOUR_SQL },
    ]);
    // The articles are locked in id order, so two orders never deadlock.
    expect(
      db.$["select.orderBy"].mock.calls.map((terms) => renderOrderBy(terms))
    ).toEqual([
      '"customer_order"."createdAt" asc',
      '"customer_order"."createdAt" asc',
      '"product"."id" asc',
    ]);
  });

  test("skips the client's limit when the platform gave no IP", async () => {
    const { create, db, selectWheres } = setup({
      clientTimes: Array.from({ length: 20 }, () => minutesIntoWindow(1)),
    });

    await create({ clientKey: null });

    expect(selectWheres().filter(({ sql }) => sql === CLIENT_HOUR_SQL)).toEqual(
      []
    );
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      clientKey: null,
    });
  });

  test.each([
    ["4 of the phone's", 4, 0],
    ["19 of the client's", 0, 19],
  ])(
    "lets an order through under the limit: %s",
    async (_case, phoneCount, clientCount) => {
      const { create } = setup({
        clientTimes: Array.from({ length: clientCount }, () =>
          minutesIntoWindow(10)
        ),
        phoneTimes: Array.from({ length: phoneCount }, () =>
          minutesIntoWindow(10)
        ),
      });

      await expect(create()).resolves.toEqual({
        code: "33333",
        token: "the-token",
      });
    }
  );

  test.each([
    // The fifth-newest leaves the window first: 10 minutes from now.
    [
      "the phone's fifth",
      { phoneTimes: [10, 20, 30, 40, 50].map(minutesIntoWindow) },
      600,
    ],
    [
      "the phone's sixth: the oldest that still counts is the second",
      { phoneTimes: [5, 10, 20, 30, 40, 50].map(minutesIntoWindow) },
      600,
    ],
    [
      "the client's twentieth",
      {
        clientTimes: Array.from({ length: 20 }, (_, index) =>
          minutesIntoWindow(index + 30)
        ),
      },
      1800,
    ],
    [
      "one leaving in 1.5 seconds rounds up",
      {
        phoneTimes: [
          { createdAt: new Date(HOUR_AGO.getTime() + 1500) },
          ...[1, 2, 3, 4].map(minutesIntoWindow),
        ],
      },
      2,
    ],
    [
      "one already out of the window still asks for 1 second",
      {
        phoneTimes: [
          { createdAt: new Date(HOUR_AGO.getTime() - 5000) },
          ...[1, 2, 3, 4].map(minutesIntoWindow),
        ],
      },
      1,
    ],
  ])(
    "refuses an order past the limit (%s), saying when to retry",
    async (_case, times, retryAfter) => {
      const { create, db } = setup(times);

      await expect(create()).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
        data: { retryAfter },
        message: "Too many orders for now",
      });
      expect(db.$["select.for"]).not.toHaveBeenCalled();
      expect(db.$.insert).not.toHaveBeenCalled();
    }
  );

  test("refuses an article the store does not sell, writing nothing", async () => {
    const { create, db } = setup({ articles: [makeArticle()] });

    await expect(create()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test.each([
    ["unavailable", { isAvailable: false }],
    ["without a price", { priceAmount: null }],
  ])("refuses an article %s, writing nothing", async (_case, overrides) => {
    const { create, db } = setup({
      articles: [makeArticle(), makeArticle({ id: 12, ...overrides })],
    });

    await expect(create()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Article not available",
    });
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  /** Two articles of one each, the second priced `secondPrice`. */
  function setupTotal(secondPrice: number) {
    const { create, db } = setup({
      articles: [
        makeArticle({ priceAmount: 2_147_483_646 }),
        makeArticle({ id: 12, priceAmount: secondPrice }),
      ],
    });
    const values = makeValues({
      items: [
        { productId: 11, quantity: 1 },
        { productId: 12, quantity: 1 },
      ],
    });

    return { db, submit: async () => await create({ values }) };
  }

  test("takes a total at the largest integer a row holds", async () => {
    const { db, submit } = setupTotal(1);

    await expect(submit()).resolves.toEqual({
      code: "33333",
      token: "the-token",
    });
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      totalAmount: 2_147_483_647,
    });
  });

  test("refuses a total one past it, writing nothing", async () => {
    const { db, submit } = setupTotal(2);

    await expect(submit()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Order total too large",
    });
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("locks the store's published articles and prices every line itself", async () => {
    const { create, db, selectWheres } = setup({
      titles: [
        { locale: "es", productId: 11, title: "Cadena" },
        { locale: "en", productId: 11, title: "Chain" },
        { locale: "es", productId: 12, title: "Anillo" },
      ],
    });

    await expect(
      create({ values: makeValues({ locale: "en", note: "Sin bolsa" }) })
    ).resolves.toEqual({ code: "33333", token: "the-token" });

    expect(selectWheres()).toContainEqual({
      params: [11, 12, STORE_ID, "published"],
      sql: ARTICLES_SQL,
    });
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(db.$["select.from"].mock.calls).toContainEqual([product]);
    expect(db.$["select.from"].mock.calls).toContainEqual([productTranslation]);
    expect(db.$.insert.mock.calls).toEqual([
      [customerOrder],
      [orderItem],
      [orderStatusEvent],
    ]);
    const [order] = db.$["insert.values"].mock.calls[0] ?? [];
    expect(order).toEqual({
      clientKey: CLIENT_KEY,
      code: expect.stringMatching(/^[2-9A-HJKMNP-Z]{5}$/u),
      createdAt: NOW,
      currencyCode: "UYU",
      customerName: "Ana Pérez",
      customerPhone: PHONE,
      locale: "en",
      note: "Sin bolsa",
      requestKey: REQUEST_KEY,
      storeId: STORE_ID,
      token: expect.stringMatching(ORDER_TOKEN_PATTERN),
      // 2 × 69 000 + 1 × 129 000.
      totalAmount: 267_000,
    });
    expect(db.$["insert.values"].mock.calls.slice(1)).toEqual([
      [
        [
          {
            orderId: 70,
            productId: 11,
            quantity: 2,
            title: "Chain",
            unitPriceAmount: 69_000,
          },
          // No English title: the Spanish one.
          {
            orderId: 70,
            productId: 12,
            quantity: 1,
            title: "Anillo",
            unitPriceAmount: 129_000,
          },
        ],
      ],
      [{ changedById: null, createdAt: NOW, orderId: 70, status: "received" }],
    ]);
    expect(db.$["insert.returning"]).toHaveBeenCalledExactlyOnceWith({
      code: customerOrder.code,
      id: customerOrder.id,
      token: customerOrder.token,
    });
  });

  test("titles an article without texts as empty", async () => {
    const { create, db } = setup();

    await create();

    expect(db.$["insert.values"].mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({ productId: 11, title: "" }),
      expect.objectContaining({ productId: 12, title: "" }),
    ]);
  });

  test("draws another code when the store already used one", async () => {
    // Each code is five draws: "22222", then "33333".
    let draws = 0;
    randomInt.mockImplementation(() => {
      draws += 1;
      return Math.floor((draws - 1) / 5);
    });
    const { create, db, selectWheres } = setup({ takenCodes: ["22222"] });

    await create();

    expect(selectWheres().filter(({ sql }) => sql === CODE_SQL)).toEqual([
      { params: [STORE_ID, "22222"], sql: CODE_SQL },
      { params: [STORE_ID, "33333"], sql: CODE_SQL },
    ]);
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      code: "33333",
    });
  });

  test("gives up after 20 taken codes, writing nothing", async () => {
    randomInt.mockReturnValue(0);
    const { create, db, selectWheres } = setup({ takenCodes: ["22222"] });

    await expect(create()).rejects.toThrow(
      "No free order code after many attempts"
    );
    expect(selectWheres().filter(({ sql }) => sql === CODE_SQL)).toEqual(
      Array.from({ length: 20 }, () => ({
        params: [STORE_ID, "22222"],
        sql: CODE_SQL,
      }))
    );
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("fails loudly when the insert returns no row, writing no items", async () => {
    const { create, db } = setup({ created: null });

    await expect(create()).rejects.toThrow(
      "Inserting an order returned no row"
    );
    expect(db.$.insert.mock.calls).toEqual([[customerOrder]]);
  });
});

function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    code: "ABCDE",
    createdAt: NOW,
    currencyCode: "UYU",
    customerName: "Ana Pérez",
    customerPhone: PHONE,
    id: 70,
    note: null,
    phoneVerifiedAt: null,
    status: "received",
    totalAmount: 138_000,
    ...overrides,
  };
}

const ITEMS = [
  { productId: 11, quantity: 2, title: "Cadena", unitPriceAmount: 69_000 },
];

describe("getOrderByToken", () => {
  function setupRead(found: ReturnType<typeof makeOrderRow> | null) {
    const db = createMockDatabase();
    db.$["select.where"].mockImplementation(async (where: unknown) => {
      const { params, sql } = renderQuery(where);

      return await Promise.resolve(
        found &&
          sql ===
            '("customer_order"."storeId" = $1 and "customer_order"."token" = $2)' &&
          params[0] === STORE_ID &&
          params[1] === "the-token"
          ? [found]
          : []
      );
    });
    db.$["select.orderBy"].mockResolvedValue(ITEMS);

    return {
      db,
      read: async () =>
        await getOrderByToken(db as never, {
          storeId: STORE_ID,
          token: "the-token",
        }),
    };
  }

  test("answers NOT_FOUND for a token the store does not have, reading no items", async () => {
    const { db, read } = setupRead(null);

    await expect(read()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Order not found",
    });
    expect(db.$["select.orderBy"]).not.toHaveBeenCalled();
  });

  test.each([
    [null, false],
    [NOW, true],
  ])(
    "shows the order without its id, the phone masked, verified at %j: %s",
    async (phoneVerifiedAt, phoneVerified) => {
      const { db, read } = setupRead(makeOrderRow({ phoneVerifiedAt }));

      await expect(read()).resolves.toEqual({
        code: "ABCDE",
        createdAt: NOW,
        currencyCode: "UYU",
        customerName: "Ana Pérez",
        customerPhone: "+598•••••456",
        items: [{ quantity: 2, title: "Cadena", unitPriceAmount: 69_000 }],
        note: null,
        phoneVerified,
        status: "received",
        totalAmount: 138_000,
      });
      expect(renderQuery(db.$["select.where"].mock.calls[1]?.[0])).toEqual({
        params: [70],
        sql: '"order_item"."orderId" = $1',
      });
      expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
        '"order_item"."id" asc'
      );
    }
  );
});

describe("listOrders", () => {
  function setupList(rows: unknown[]) {
    const db = createMockDatabase();
    db.$["select.limit"].mockResolvedValue(rows);

    return { db };
  }

  function listRow(id: number, overrides: Record<string, unknown> = {}) {
    const {
      customerPhone: _phone,
      note: _note,
      ...row
    } = makeOrderRow({
      code: `C${String(id)}`,
      id,
      ...overrides,
    });
    return row;
  }

  test("lists the store's orders newest first, a page of 50 plus one to peek", async () => {
    const { db } = setupList([]);

    await expect(
      listOrders(db as never, { storeId: STORE_ID })
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID],
      sql: '"customer_order"."storeId" = $1',
    });
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"customer_order"."createdAt" desc, "customer_order"."id" desc'
    );
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(51);
  });

  test("narrows by status and starts strictly after the cursor", async () => {
    const { db } = setupList([]);

    await listOrders(db as never, {
      cursor: { createdAt: NOW, id: 40 },
      status: "packed",
      storeId: STORE_ID,
    });

    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, "packed", NOW.toISOString(), NOW.toISOString(), 40],
      sql:
        '("customer_order"."storeId" = $1 and "customer_order"."status" = $2 and ' +
        '("customer_order"."createdAt" < $3 or ("customer_order"."createdAt" = $4 and "customer_order"."id" < $5)))',
    });
  });

  test("points the cursor at the page's last order when one more follows", async () => {
    const later = new Date("2026-11-15T11:00:00.000Z");
    const { db } = setupList([
      listRow(9, { phoneVerifiedAt: NOW }),
      listRow(8, { createdAt: later }),
      listRow(7),
    ]);

    await expect(
      listOrders(db as never, { limit: 2, storeId: STORE_ID })
    ).resolves.toEqual({
      items: [
        {
          code: "C9",
          createdAt: NOW,
          currencyCode: "UYU",
          customerName: "Ana Pérez",
          id: 9,
          phoneVerified: true,
          status: "received",
          totalAmount: 138_000,
        },
        {
          code: "C8",
          createdAt: later,
          currencyCode: "UYU",
          customerName: "Ana Pérez",
          id: 8,
          phoneVerified: false,
          status: "received",
          totalAmount: 138_000,
        },
      ],
      nextCursor: { createdAt: later, id: 8 },
    });
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(3);
  });

  test("has no cursor when the page is exactly full", async () => {
    const { db } = setupList([listRow(9), listRow(8)]);

    const page = await listOrders(db as never, { limit: 2, storeId: STORE_ID });

    expect(page.items.map((row) => row.id)).toEqual([9, 8]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("getOrder", () => {
  const HISTORY = [
    { changedByName: null, createdAt: NOW, status: "received" },
    { changedByName: "Lucía", createdAt: NOW, status: "packed" },
  ];

  function setupGet(found: unknown) {
    const db = createMockDatabase();
    db.$["select.where"].mockImplementation(async (where: unknown) => {
      const { params, sql } = renderQuery(where);

      return await Promise.resolve(
        found &&
          sql ===
            '("customer_order"."id" = $1 and "customer_order"."storeId" = $2)' &&
          params[0] === 70 &&
          params[1] === STORE_ID
          ? [found]
          : []
      );
    });
    db.$["select.orderBy"].mockImplementation(async () => {
      const { sql } = renderQuery(db.$["select.where"].mock.calls.at(-1)?.[0]);

      return await Promise.resolve(
        sql.startsWith('"order_status_event"') ? HISTORY : ITEMS
      );
    });

    return {
      db,
      read: async () =>
        await getOrder(db as never, { id: 70, storeId: STORE_ID }),
    };
  }

  test("answers NOT_FOUND for an order of another store, reading nothing else", async () => {
    const { db, read } = setupGet(null);

    await expect(read()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Order not found",
    });
    expect(db.$["select.orderBy"]).not.toHaveBeenCalled();
  });

  test("shows the full phone, the items and who set each status", async () => {
    const { db, read } = setupGet(
      makeOrderRow({ locale: "en", phoneVerifiedAt: NOW })
    );

    await expect(read()).resolves.toEqual({
      code: "ABCDE",
      createdAt: NOW,
      currencyCode: "UYU",
      customerName: "Ana Pérez",
      customerPhone: PHONE,
      history: HISTORY,
      id: 70,
      items: ITEMS,
      locale: "en",
      note: null,
      phoneVerified: true,
      status: "received",
      totalAmount: 138_000,
    });
    expect(db.$["select.leftJoin"].mock.calls[0]?.[0]).toBe(user);
    expect(renderQuery(db.$["select.leftJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '"user"."id" = "order_status_event"."changedById"',
    });
    expect(
      db.$["select.where"].mock.calls
        .slice(1)
        .map(([where]) => renderQuery(where))
    ).toEqual([
      { params: [70], sql: '"order_status_event"."orderId" = $1' },
      { params: [70], sql: '"order_item"."orderId" = $1' },
    ]);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"order_status_event"."createdAt" asc, "order_status_event"."id" asc'
    );
  });
});

describe("changeOrderStatus", () => {
  function setupChange(current: OrderStatus | null) {
    const db = createMockDatabase();
    db.$["select.for"].mockImplementation(async () => {
      const { params, sql } = renderQuery(
        db.$["select.where"].mock.calls.at(-1)?.[0]
      );

      return await Promise.resolve(
        current &&
          sql ===
            '("customer_order"."id" = $1 and "customer_order"."storeId" = $2)' &&
          params[0] === 70 &&
          params[1] === STORE_ID
          ? [{ status: current }]
          : []
      );
    });

    return {
      change: async (status: OrderStatus) =>
        await changeOrderStatus(db as never, {
          id: 70,
          status,
          storeId: STORE_ID,
          userId: "staff-user-id",
        }),
      db,
    };
  }

  test("answers NOT_FOUND for an order of another store, writing nothing", async () => {
    const { change, db } = setupChange(null);

    await expect(change("packed")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Order not found",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test.each([
    ["received", "packed"],
    ["packed", "delivered"],
    ["packed", "undeliverable"],
    ["packed", "received"],
    ["delivered", "packed"],
    ["undeliverable", "packed"],
  ] as const)(
    "moves %s to %s under the order's lock, recording who did it",
    async (current, status) => {
      const { change, db } = setupChange(current);

      await expect(change(status)).resolves.toEqual({ id: 70, status });

      expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("update");
      expect(db.$.update).toHaveBeenCalledExactlyOnceWith(customerOrder);
      expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({ status });
      expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
        params: [70],
        sql: '"customer_order"."id" = $1',
      });
      expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(orderStatusEvent);
      expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
        changedById: "staff-user-id",
        orderId: 70,
        status,
      });
    }
  );

  test.each([
    ["received", "received"],
    ["received", "delivered"],
    ["received", "undeliverable"],
    ["packed", "packed"],
    ["delivered", "delivered"],
    ["delivered", "received"],
    ["delivered", "undeliverable"],
    ["undeliverable", "undeliverable"],
    ["undeliverable", "received"],
    ["undeliverable", "delivered"],
  ] as const)(
    "refuses to move %s to %s, writing nothing",
    async (current, status) => {
      const { change, db } = setupChange(current);

      await expect(change(status)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "That status change is not allowed",
      });
      expect(db.$.update).not.toHaveBeenCalled();
      expect(db.$.insert).not.toHaveBeenCalled();
    }
  );
});
