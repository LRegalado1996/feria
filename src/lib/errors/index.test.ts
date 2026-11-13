import { ORPCError } from "@orpc/client";
import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  appErrorDataSchema,
  causeChain,
  classifyError,
  ERROR_WHYS,
  getErrorData,
  isNetworkTransportError,
} from ".";

function systemError(code: string): Error {
  return Object.assign(new Error(`connect ${code}`), { code });
}

describe("appErrorDataSchema", () => {
  test("accepts only a curated why", () => {
    expect(appErrorDataSchema.parse({ why: ERROR_WHYS.DATABASE })).toEqual({
      why: ERROR_WHYS.DATABASE,
    });
    expect(
      appErrorDataSchema
        .safeParse({ why: 'relation "post" does not exist' })
        .error?.issues.map((issue) => issue.path)
    ).toEqual([["why"]]);
  });
});

describe("causeChain", () => {
  test("lists the error and every cause, outermost first", () => {
    const root = new Error("root");
    const middle = new Error("middle", { cause: root });
    const outer = new Error("outer", { cause: middle });

    expect(causeChain(outer)).toEqual([outer, middle, root]);
  });

  test("stops on a cycle and on a non-object", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.assign(a, { cause: b });

    expect(causeChain(a)).toEqual([a, b]);
    expect(causeChain("text")).toEqual([]);
  });
});

describe("classifyError", () => {
  test("names a failed query or a driver error a database problem", () => {
    const pgError = Object.assign(new Error("terminating connection"), {
      code: "57P01",
      severity: "FATAL",
    });

    expect(classifyError(new DrizzleQueryError("select 1", [], pgError))).toBe(
      ERROR_WHYS.DATABASE
    );
    expect(classifyError(pgError)).toBe(ERROR_WHYS.DATABASE);
  });

  test.each(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EPIPE"])(
    "names a %s connection a network problem",
    (code) => {
      expect(classifyError(systemError(code))).toBe(ERROR_WHYS.NETWORK);
    }
  );

  test.each([
    ["ETIMEDOUT", systemError("ETIMEDOUT")],
    ["undici's connect timeout", systemError("UND_ERR_CONNECT_TIMEOUT")],
    ["an abort", new DOMException("aborted", "AbortError")],
    ["a TimeoutError", new DOMException("late", "TimeoutError")],
  ])("names %s a timeout", (_case, error) => {
    expect(classifyError(error)).toBe(ERROR_WHYS.TIMEOUT);
  });

  test("finds the cause further down the chain", () => {
    const wrapped = new Error("handler failed", {
      cause: systemError("ECONNREFUSED"),
    });

    expect(classifyError(wrapped)).toBe(ERROR_WHYS.NETWORK);
  });

  test("returns undefined rather than the error's own words", () => {
    expect(classifyError(new Error("relation does not exist"))).toBeUndefined();
    expect(classifyError("text")).toBeUndefined();
  });
});

describe("isNetworkTransportError", () => {
  test.each([
    "Failed to fetch",
    "fetch failed",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "Network error",
  ])("is true for the browser's no-response failure %j", (message) => {
    expect(isNetworkTransportError(new TypeError(message))).toBe(true);
  });

  test.each([
    [
      "a chunk that failed to load",
      new TypeError("Failed to fetch dynamically imported module: /a.js"),
    ],
    [
      "a bug that mentions fetch",
      new TypeError("Cannot read properties of undefined (reading 'fetch')"),
    ],
    [
      "a no-response message that is not a TypeError",
      new Error("Failed to fetch"),
    ],
    [
      "a server answer, whatever its cause",
      new ORPCError("INTERNAL_SERVER_ERROR", { cause: systemError("EPIPE") }),
    ],
  ])("is false for %s", (_case, error) => {
    expect(isNetworkTransportError(error)).toBe(false);
  });
});

describe("getErrorData", () => {
  test("reads the correlation ids an ORPCError carries", () => {
    const error = new ORPCError("INTERNAL_SERVER_ERROR", {
      data: {
        eventId: "evt",
        procedure: "post.create",
        requestId: "req",
        why: ERROR_WHYS.DATABASE,
      },
    });

    expect(getErrorData(error)).toEqual({
      eventId: "evt",
      procedure: "post.create",
      requestId: "req",
    });
  });

  test("drops fields that are not strings", () => {
    const error = new ORPCError("BAD_REQUEST", {
      data: { eventId: 42, requestId: { nested: true } },
    });

    expect(getErrorData(error)).toEqual({
      eventId: undefined,
      procedure: undefined,
      requestId: undefined,
    });
  });

  test("returns nothing for an error without data", () => {
    expect(getErrorData(new ORPCError("NOT_FOUND"))).toEqual({});
    expect(getErrorData(new Error("x"))).toEqual({});
  });
});
