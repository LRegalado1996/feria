import { describe, expect, test } from "vitest";

import {
  changeOrderStatusSchema,
  createCheckoutSchema,
  createOrderSchema,
  getOrderByTokenSchema,
  getOrderSchema,
  listOrdersSchema,
  ORDER_MOVES,
  ORDER_SEARCH_MAX_LENGTH,
  ORDER_STATUSES,
} from ".";

const REQUEST_KEY = "11111111-1111-4111-8111-111111111111";
const TOKEN = "a".repeat(43);

function makeItem(overrides: Record<string, unknown> = {}) {
  return { productId: 1, quantity: 1, ...overrides };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Ana Pérez",
    customerPhone: "099 123 456",
    items: [makeItem()],
    locale: "es",
    note: "",
    requestKey: REQUEST_KEY,
    ...overrides,
  };
}

const accepts = (overrides: Record<string, unknown>) =>
  createOrderSchema.safeParse(makeOrder(overrides)).success;

const items = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeItem({ productId: index + 1 })
  );

describe("ORDER_MOVES", () => {
  test("moves forward along the delivery, or one step back", () => {
    expect(ORDER_MOVES).toEqual({
      delivered: ["packed"],
      packed: ["delivered", "undeliverable", "received"],
      received: ["packed"],
      undeliverable: ["packed"],
    });
  });

  test("names a move for every status, and only statuses", () => {
    expect(new Set(Object.keys(ORDER_MOVES))).toEqual(new Set(ORDER_STATUSES));
    for (const targets of Object.values(ORDER_MOVES)) {
      expect(
        targets.filter((status) => !ORDER_STATUSES.includes(status))
      ).toEqual([]);
    }
  });
});

describe("createOrderSchema", () => {
  test.each([
    ["an item's price", { items: [makeItem({ unitPriceAmount: 1 })] }],
    ["the order's total", { totalAmount: 1 }],
    ["a field it does not name", { storeId: 7 }],
    // The site is one store: an order names none (FER-038).
    ["a store's address", { storeSlug: "lr-market" }],
  ])("refuses %s as tampering, never trims it", (_what, overrides) => {
    const result = createOrderSchema.safeParse(makeOrder(overrides));

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual([
      "unrecognized_keys",
    ]);
  });

  test("trims the name, normalizes the phone and reads a blank note as none", () => {
    expect(
      createOrderSchema.parse(
        makeOrder({
          customerName: "  Ana Pérez  ",
          items: [makeItem({ productId: 3, quantity: 2 })],
          note: "   ",
        })
      )
    ).toEqual({
      customerName: "Ana Pérez",
      customerPhone: "+59899123456",
      items: [{ productId: 3, quantity: 2 }],
      locale: "es",
      note: null,
      requestKey: REQUEST_KEY,
    });
  });

  test.each([
    ["left out", undefined],
    ["null", null],
    ["empty", ""],
  ])("reads a note %s as none", (_case, note) => {
    const { note: _omitted, ...rest } = makeOrder();

    expect(
      createOrderSchema.parse(note === undefined ? rest : { ...rest, note })
        .note
    ).toBeNull();
  });

  test("keeps a note, trimmed", () => {
    expect(
      createOrderSchema.parse(makeOrder({ note: " Sin bolsa " })).note
    ).toBe("Sin bolsa");
  });

  test.each([
    ["one item", { items: items(1) }, true],
    ["20 items", { items: items(20) }, true],
    ["21 items", { items: items(21) }, false],
    ["no items", { items: [] }, false],
    ["a quantity of 1", { items: [makeItem({ quantity: 1 })] }, true],
    ["a quantity of 10", { items: [makeItem({ quantity: 10 })] }, true],
    ["a quantity of 0", { items: [makeItem({ quantity: 0 })] }, false],
    ["a quantity of 11", { items: [makeItem({ quantity: 11 })] }, false],
    ["a fractional quantity", { items: [makeItem({ quantity: 1.5 })] }, false],
    [
      "a quantity sent as text",
      { items: [makeItem({ quantity: "2" })] },
      false,
    ],
    [
      "the same article twice",
      { items: [makeItem(), makeItem({ quantity: 2 })] },
      false,
    ],
    [
      "an article id sent as text",
      { items: [makeItem({ productId: "1" })] },
      false,
    ],
    [
      "a fractional article id",
      { items: [makeItem({ productId: 1.5 })] },
      false,
    ],
    ["an article id of 0", { items: [makeItem({ productId: 0 })] }, false],
    [
      "an article id past int4",
      { items: [makeItem({ productId: 2_147_483_648 })] },
      false,
    ],
    ["a name of 80 characters", { customerName: "x".repeat(80) }, true],
    ["a name of 81 characters", { customerName: "x".repeat(81) }, false],
    ["a name of 1 character", { customerName: "x" }, true],
    ["a blank name", { customerName: "   " }, false],
    ["a note of 500 characters", { note: "x".repeat(500) }, true],
    ["a note of 501 characters", { note: "x".repeat(501) }, false],
    ["no note", { note: null }, true],
    ["no note field", { note: undefined }, true],
    ["a phone that is not one", { customerPhone: "24001234" }, false],
    ["a blank phone", { customerPhone: "   " }, false],
    [
      "a phone of 31 characters",
      { customerPhone: `+598${" ".repeat(19)}99123456` },
      false,
    ],
    [
      "a phone of 30 characters",
      { customerPhone: `+598${" ".repeat(18)}99123456` },
      true,
    ],
    ["a request key that is not a uuid", { requestKey: "abc" }, false],
    // The checkout draws a v4 (`crypto.randomUUID()`); any other is not its.
    [
      "a v4 request key",
      { requestKey: "22222222-2222-4222-8222-222222222222" },
      true,
    ],
    [
      "the nil uuid",
      { requestKey: "00000000-0000-0000-0000-000000000000" },
      false,
    ],
    [
      "a v1 request key",
      { requestKey: "33333333-3333-1333-8333-333333333333" },
      false,
    ],
    [
      "a v7 request key",
      { requestKey: "44444444-4444-7444-8444-444444444444" },
      false,
    ],
    ["no request key", { requestKey: undefined }, false],
    ["another language", { locale: "fr" }, false],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(accepts(overrides)).toBe(accepted);
  });

  test.each([
    [
      { items: [makeItem(), makeItem()] },
      ["items", "Each article appears once, with its quantity"],
    ],
    [{ customerPhone: "24001234" }, ["customerPhone", "Not a phone number"]],
  ])("explains %j", (overrides, expected) => {
    expect(
      createOrderSchema
        .safeParse(makeOrder(overrides))
        .error?.issues.map((issue) => [issue.path.join("."), issue.message])
    ).toEqual([expected]);
  });
});

describe("getOrderByTokenSchema", () => {
  test.each([
    ["43 base64url characters", TOKEN, true],
    ["with - and _", `${"Ab9-_".repeat(8)}xyz`, true],
    ["42 characters", "a".repeat(42), false],
    ["44 characters", "a".repeat(44), false],
    ["a + (base64, not base64url)", `${"a".repeat(42)}+`, false],
    ["a padding =", `${"a".repeat(42)}=`, false],
    ["empty", "", false],
  ])("a token of %s is accepted: %s", (_case, token, accepted) => {
    expect(getOrderByTokenSchema.safeParse({ token }).success).toBe(accepted);
  });
});

describe("listOrdersSchema", () => {
  test("reads the cursor from the query string, with an optional status", () => {
    expect(
      listOrdersSchema.parse({
        cursor: { createdAt: "2026-11-15T10:00:00.000Z", id: "7" },
        status: "packed",
      })
    ).toEqual({
      cursor: { createdAt: new Date("2026-11-15T10:00:00.000Z"), id: 7 },
      status: "packed",
    });
    expect(listOrdersSchema.parse({})).toEqual({});
  });

  test.each([
    [{ status: "cancelled" }, false],
    [{ cursor: { createdAt: "yesterday", id: 7 } }, false],
    [{ cursor: { createdAt: "2026-11-15T10:00:00.000Z", id: 0 } }, false],
    [{ cursor: { createdAt: "2026-11-15T10:00:00.000Z" } }, false],
    [{ status: "undeliverable" }, true],
    [{ q: "an\u0000a" }, false],
  ])("%j is accepted: %s", (overrides, accepted) => {
    expect(listOrdersSchema.safeParse(overrides).success).toBe(accepted);
  });

  test.each([
    ["  JOSÉ  ", "JOSÉ"],
    ["099 123", "099 123"],
    ["", undefined],
    ["   ", undefined],
  ])("reads the search %j as %j", (q, expected) => {
    expect(listOrdersSchema.parse({ q })).toEqual({ q: expected });
  });

  test("takes a search of 80 characters, trimmed first, and refuses 81", () => {
    expect(ORDER_SEARCH_MAX_LENGTH).toBe(80);
    expect(
      listOrdersSchema.parse({
        q: ` ${"a".repeat(80)} `,
      }).q
    ).toBe("a".repeat(80));
    expect(listOrdersSchema.safeParse({ q: "a".repeat(81) }).success).toBe(
      false
    );
  });
});

describe("getOrderSchema and changeOrderStatusSchema", () => {
  test.each([
    ["5", true],
    ["2147483647", true],
    ["2147483648", false],
    ["0", false],
    ["", false],
  ])("an id of %j is accepted: %s", (id, accepted) => {
    expect([
      getOrderSchema.safeParse({ id }).success,
      changeOrderStatusSchema.safeParse({
        id,
        status: "packed",
      }).success,
    ]).toEqual([accepted, accepted]);
  });

  test.each([
    ["delivered", true],
    ["cancelled", false],
    [undefined, false],
  ])("a status of %j is accepted: %s", (status, accepted) => {
    expect(
      changeOrderStatusSchema.safeParse({
        id: 5,
        status,
      }).success
    ).toBe(accepted);
  });
});

const CHECKOUT_MESSAGES = {
  nameRequired: "Name, please",
  nameTooLong: "A shorter name, please",
  noteTooLong: "A shorter note, please",
  phoneInvalid: "A mobile, please",
};

function makeCheckout(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Ana Pérez",
    customerPhone: "099 123 456",
    note: "",
    ...overrides,
  };
}

/** Each issue as `[field, message]`, or `[]` when the form is valid. */
const checkoutIssues = (overrides: Record<string, unknown>) =>
  (
    createCheckoutSchema(CHECKOUT_MESSAGES).safeParse(makeCheckout(overrides))
      .error?.issues ?? []
  ).map((issue) => [issue.path.join("."), issue.message]);

describe("createCheckoutSchema", () => {
  test("keeps the phone as typed and trims every field", () => {
    expect(
      createCheckoutSchema(CHECKOUT_MESSAGES).parse(
        makeCheckout({
          customerName: " Ana Pérez ",
          customerPhone: " +598 99 123 456 ",
          note: " Sin bolsa ",
        })
      )
    ).toEqual({
      customerName: "Ana Pérez",
      customerPhone: "+598 99 123 456",
      note: "Sin bolsa",
    });
  });

  test.each([
    ["a local mobile", { customerPhone: "099 123 456" }],
    ["an international mobile", { customerPhone: "+598 99 123 456" }],
    ["a name of 80 characters", { customerName: "x".repeat(80) }],
    ["a note of 500 characters", { note: "x".repeat(500) }],
    [
      "a phone of 30 characters",
      { customerPhone: `+598${" ".repeat(18)}99123456` },
    ],
  ])("accepts %s", (_case, overrides) => {
    expect(checkoutIssues(overrides)).toEqual([]);
  });

  test.each([
    ["a blank name", { customerName: "   " }, "customerName", "Name, please"],
    [
      "a landline",
      { customerPhone: "24001234" },
      "customerPhone",
      "A mobile, please",
    ],
    [
      "a blank phone",
      { customerPhone: "" },
      "customerPhone",
      "A mobile, please",
    ],
  ])(
    "says what is wrong with %s, in the page's words",
    (_case, overrides, field, message) => {
      expect(checkoutIssues(overrides)).toEqual([[field, message]]);
    }
  );

  test("a phone of 31 characters is refused in the page's words", () => {
    expect(
      checkoutIssues({ customerPhone: `+598${" ".repeat(19)}99123456` })
    ).toEqual([["customerPhone", "A mobile, please"]]);
  });

  test.each([
    [
      "a name of 81 characters",
      { customerName: "x".repeat(81) },
      "customerName",
      "A shorter name, please",
    ],
    [
      "a note of 501 characters",
      { note: "x".repeat(501) },
      "note",
      "A shorter note, please",
    ],
  ])("refuses %s in the page's words", (_case, overrides, field, message) => {
    expect(checkoutIssues(overrides)).toEqual([[field, message]]);
  });
});
