import { ORPCError } from "@orpc/client";
import { describe, expect, test } from "vitest";

import { en } from "@/content/en";
import { es } from "@/content/es";

import { checkoutErrorMessage, checkoutFailure } from "./checkout-error";

const COPY = en.storefront.cart.errors;

function makeError(
  code: string,
  { data, message }: { data?: unknown; message?: string } = {}
) {
  return new ORPCError(code, { data, message });
}

describe("checkoutFailure", () => {
  test.each([
    ["too many orders", makeError("TOO_MANY_REQUESTS"), "limited"],
    [
      "too many orders, whatever the message",
      makeError("TOO_MANY_REQUESTS", { message: "Article not available" }),
      "limited",
    ],
    [
      "a sold-out article",
      makeError("BAD_REQUEST", { message: "Article not available" }),
      "stale",
    ],
    [
      "an article gone",
      makeError("NOT_FOUND", { message: "Article not found" }),
      "stale",
    ],
    [
      "a malformed request",
      makeError("BAD_REQUEST", { message: "Input validation failed" }),
      "refused",
    ],
    ["a script", makeError("FORBIDDEN", { message: "Forbidden" }), "refused"],
    [
      "a closed store",
      makeError("NOT_FOUND", { message: "Store not found" }),
      "refused",
    ],
    [
      "a server failure",
      makeError("INTERNAL_SERVER_ERROR", { message: "Internal server error" }),
      "unexpected",
    ],
    ["a network failure", new TypeError("Failed to fetch"), "unexpected"],
    [
      "an error that only looks like oRPC's",
      Object.assign(new Error("Article not available"), {
        code: "FORBIDDEN",
      }),
      "unexpected",
    ],
  ])("reads %s as %s", (_case, error, expected) => {
    expect(checkoutFailure(error)).toBe(expected);
  });
});

describe("checkoutErrorMessage", () => {
  test.each([
    ["60 s", 60, 1],
    ["61 s", 61, 2],
    ["one hour", 3600, 60],
    ["1 s", 1, 1],
    ["0 s", 0, 1],
  ])(
    "too many orders with %s to wait says %i min",
    (_case, retryAfter, minutes) => {
      expect(
        checkoutErrorMessage(
          makeError("TOO_MANY_REQUESTS", { data: { retryAfter } }),
          COPY
        )
      ).toBe(
        `You placed several orders in a short time. Try again in ${minutes} min.`
      );
    }
  );

  test.each([
    ["no data", undefined],
    ["data without retryAfter", { limit: 5 }],
    ["a retryAfter as text", { retryAfter: "120" }],
    ["data that is not an object", "120"],
    ["null data", null],
  ])("too many orders with %s says 1 min", (_case, data) => {
    expect(
      checkoutErrorMessage(makeError("TOO_MANY_REQUESTS", { data }), COPY)
    ).toBe("You placed several orders in a short time. Try again in 1 min.");
  });

  test.each([
    [
      "a sold-out article",
      makeError("BAD_REQUEST", { message: "Article not available" }),
      COPY.changed,
    ],
    ["a refused order", makeError("FORBIDDEN"), COPY.refused],
    [
      "a server failure",
      makeError("INTERNAL_SERVER_ERROR", { data: { retryAfter: 600 } }),
      COPY.failed,
    ],
    ["a network failure", new TypeError("Failed to fetch"), COPY.failed],
  ])("says %s in the page's words", (_case, error, expected) => {
    expect(checkoutErrorMessage(error, COPY)).toBe(expected);
  });

  test("speaks Spanish on a Spanish page", () => {
    expect(
      checkoutErrorMessage(
        makeError("TOO_MANY_REQUESTS", { data: { retryAfter: 300 } }),
        es.storefront.cart.errors
      )
    ).toBe(
      "Ya hiciste varios pedidos en poco tiempo. Probá de nuevo en 5 min."
    );
  });
});
