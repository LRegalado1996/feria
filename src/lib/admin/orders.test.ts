import { describe, expect, test } from "vitest";

import { INT4_MAX } from "@/lib/schemas/catalog";
import { ORDER_SEARCH_MAX_LENGTH } from "@/lib/schemas/order";

import { orderPath, ordersPath, readOrderId, readOrdersQuery } from "./orders";

describe("readOrdersQuery", () => {
  test.each([
    [{}, {}],
    [{ status: "received" }, { status: "received" }],
    [{ status: "undeliverable" }, { status: "undeliverable" }],
    // Unknown, or not in the API's spelling: all of them.
    [{ status: "shipped" }, {}],
    [{ status: "Received" }, {}],
    [{ status: "" }, {}],
    [{ q: "  K7P2Q " }, { q: "K7P2Q" }],
    [{ q: "   " }, {}],
    [{ q: "" }, {}],
    [
      { q: ["ana", "beto"], status: ["packed", "delivered"] },
      { q: "ana", status: "packed" },
    ],
  ])("reads %j as %j", (searchParams, expected) => {
    expect(readOrdersQuery(searchParams)).toEqual(expected);
  });

  test("keeps a search at the API's limit and cuts one past it", () => {
    const atLimit = "a".repeat(ORDER_SEARCH_MAX_LENGTH);

    expect(readOrdersQuery({ q: atLimit })).toEqual({ q: atLimit });
    expect(readOrdersQuery({ q: `${atLimit}b` })).toEqual({ q: atLimit });
  });
});

describe("ordersPath", () => {
  test.each([
    ["es", {}, "/admin/lr-market/orders"],
    ["en", {}, "/en/admin/lr-market/orders"],
    ["es", { status: "packed" }, "/admin/lr-market/orders?status=packed"],
    [
      "en",
      { q: " José 099 ", status: "received" },
      "/en/admin/lr-market/orders?status=received&q=Jos%C3%A9+099",
    ],
    ["es", { q: "  " }, "/admin/lr-market/orders"],
  ] as const)("in %s, %j is %s", (locale, query, expected) => {
    expect(ordersPath("lr-market", locale, query)).toBe(expected);
  });
});

describe("orderPath", () => {
  test.each([
    ["es", "/admin/lr-market/orders/42"],
    ["en", "/en/admin/lr-market/orders/42"],
  ] as const)("in %s is %s", (locale, expected) => {
    expect(orderPath("lr-market", 42, locale)).toBe(expected);
  });

  test.each([
    ["es", {}, "/admin/lr-market/orders/42"],
    [
      "es",
      { status: "received" },
      "/admin/lr-market/orders/42?status=received",
    ],
    [
      "en",
      { q: " Ana 099 ", status: "packed" },
      "/en/admin/lr-market/orders/42?status=packed&q=Ana+099",
    ],
    ["es", { q: "  " }, "/admin/lr-market/orders/42"],
  ] as const)("in %s, opened from %j, is %s", (locale, from, expected) => {
    expect(orderPath("lr-market", 42, locale, from)).toBe(expected);
  });
});

describe("readOrderId", () => {
  test.each([
    ["1", 1],
    ["42", 42],
    [String(INT4_MAX), INT4_MAX],
    [String(INT4_MAX + 1), null],
    ["0", null],
    ["-3", null],
    ["007", null],
    ["1.5", null],
    ["1e3", null],
    [" 4", null],
    ["", null],
    ["abc", null],
  ])("reads %j as %j", (segment, expected) => {
    expect(readOrderId(segment)).toBe(expected);
  });
});
