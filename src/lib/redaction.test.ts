import { describe, expect, test } from "vitest";

import {
  makeSessionQueryError,
  SESSION_QUERY,
  SYNTHETIC_SESSION_TOKEN,
} from "@/test/session-query-error";

import { REDACTED, sanitizeForLog, sanitizeRecordInPlace } from "./redaction";

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

describe("sensitive keys", () => {
  test.each([
    "password",
    "sessionToken",
    "AUTHORIZATION",
    "set-cookie",
    "params",
    "Params",
    "error.params",
  ])("withholds the value under %s", (key) => {
    expect(sanitizeForLog({ [key]: SYNTHETIC_SESSION_TOKEN })).toEqual({
      [key]: REDACTED,
    });
  });

  test.each(["searchParams", "paramsCount", "postId", "procedure"])(
    "keeps the value under %s, since only a whole `params` key holds bound values",
    (key) => {
      expect(sanitizeForLog({ [key]: "kept" })).toEqual({ [key]: "kept" });
    }
  );
});

describe("sensitive text", () => {
  test("withholds the params line of a Drizzle message and keeps the query", () => {
    expect(sanitizeForLog(makeSessionQueryError().message)).toBe(
      `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`
    );
  });

  test("withholds everything after the label, a line that looks like a frame included", () => {
    // A bound value is free text: it can carry its own newline and `at ...`.
    const text = `Failed query: ${SESSION_QUERY}\nparams: harmless\n    at ${SYNTHETIC_SESSION_TOKEN}`;

    expect(sanitizeForLog(text)).toBe(
      `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`
    );
  });

  test("withholds a value that spans several lines", () => {
    const text = `Failed query: ${SESSION_QUERY}\nparams: first line\n${SYNTHETIC_SESSION_TOKEN}`;

    expect(sanitizeForLog(text)).toBe(
      `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`
    );
  });

  test("withholds an empty parameter list too, so the output never varies with it", () => {
    expect(sanitizeForLog("Failed query: select 1\nparams: ")).toBe(
      `Failed query: select 1\nparams: ${REDACTED}`
    );
  });

  test.each([
    [
      `Key (token)=(${SYNTHETIC_SESSION_TOKEN}) already exists.`,
      `Key (token)=(${REDACTED})`,
    ],
    [
      `Key (lower(email::text))=(${SYNTHETIC_SESSION_TOKEN}) already exists.`,
      `Key (lower(email::text))=(${REDACTED})`,
    ],
    [
      `Key ("userId")=(${SYNTHETIC_SESSION_TOKEN}) is not present in table "user".`,
      `Key ("userId")=(${REDACTED})`,
    ],
    [
      `Key (slot)=(${SYNTHETIC_SESSION_TOKEN}) conflicts with existing key (slot)=(${SYNTHETIC_SESSION_TOKEN}).`,
      `Key (slot)=(${REDACTED})`,
    ],
    [
      // The value itself ends in what looks like the end of the sentence.
      `Key (note)=(harmless) already exists. ${SYNTHETIC_SESSION_TOKEN}) already exists.`,
      `Key (note)=(${REDACTED})`,
    ],
    [
      `Failing row contains (1, ${SYNTHETIC_SESSION_TOKEN}, null).`,
      `Failing row contains (${REDACTED})`,
    ],
    [
      `Failing row contains (1, harmless)\n${SYNTHETIC_SESSION_TOKEN}, null).`,
      `Failing row contains (${REDACTED})`,
    ],
  ])("withholds the values Postgres echoes in %s", (detail, expected) => {
    expect(sanitizeForLog(detail)).toBe(expected);
  });

  test("leaves text without query values untouched", () => {
    const text = "Connection terminated unexpectedly; searchParams: page=2";

    expect(sanitizeForLog(text)).toBe(text);
  });
});

describe("sanitizeForLog", () => {
  test("reduces a Drizzle error to its diagnosis and drops its bound values", () => {
    const sanitized = sanitizeForLog(makeSessionQueryError());

    expect(serialized(sanitized)).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(sanitized).toEqual({
      name: "Error",
      message: `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`,
      // The frames survive: the stack is split at the message's end.
      stack: expect.stringMatching(
        /^Error: Failed query: .*\nparams: \[REDACTED\]\n {4}at makeSessionQueryError /s
      ),
      cause: {
        name: "Error",
        message: "Connection terminated unexpectedly",
        stack: expect.stringContaining("Connection terminated unexpectedly"),
        code: "57P01",
      },
    });
  });

  test("withholds a bound value that imitates a stack frame from the stack too", () => {
    const error = makeSessionQueryError([
      `harmless\n    at ${SYNTHETIC_SESSION_TOKEN}`,
    ]);

    const sanitized = sanitizeForLog(error);

    expect(serialized(sanitized)).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(sanitized).toMatchObject({
      message: `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`,
      stack: expect.stringMatching(
        /^Error: Failed query: .*\nparams: \[REDACTED\]\n {4}at makeSessionQueryError /s
      ),
    });
  });

  test("withholds the rest of a stack whose header no longer matches its message", () => {
    const error = makeSessionQueryError();
    // A library that rewrites the message after the stack was captured.
    error.message = "Failed query";

    const sanitized = sanitizeForLog(error);

    expect(serialized(sanitized)).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(sanitized).toMatchObject({ message: "Failed query" });
  });

  test("splits a serialized error's stack at its sibling message", () => {
    const { message, stack } = makeSessionQueryError();

    const sanitized = sanitizeForLog({ name: "Error", message, stack });

    expect(serialized(sanitized)).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(sanitized).toMatchObject({
      stack: expect.stringContaining(
        `params: ${REDACTED}\n    at makeSessionQueryError `
      ),
    });
  });

  test("scrubs a stack with no message beside it as plain text", () => {
    const { stack } = makeSessionQueryError();

    expect(sanitizeForLog({ stack })).toEqual({
      stack: `Error: Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`,
    });
  });

  test("scrubs a cause nested several errors deep", () => {
    const wrapped = new Error("INTERNAL_SERVER_ERROR", {
      cause: new Error("findSession failed", {
        cause: makeSessionQueryError(),
      }),
    });

    const sanitized = sanitizeForLog(wrapped);

    expect(serialized(sanitized)).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(sanitized).toMatchObject({
      message: "INTERNAL_SERVER_ERROR",
      cause: {
        message: "findSession failed",
        cause: { name: "Error", cause: { code: "57P01" } },
      },
    });
  });

  test("keeps a numeric code and drops one that is not a primitive", () => {
    const numeric = Object.assign(new Error("timeout"), { code: 408 });
    const structured = Object.assign(new Error("odd"), {
      code: { token: SYNTHETIC_SESSION_TOKEN },
    });

    expect(sanitizeForLog(numeric)).toMatchObject({ code: 408 });
    expect(sanitizeForLog(structured)).not.toHaveProperty("code");
  });

  test("withholds a params array held under its key, at any depth", () => {
    const sanitized = sanitizeForLog({
      contexts: {
        DrizzleQueryError: {
          query: SESSION_QUERY,
          params: [SYNTHETIC_SESSION_TOKEN],
        },
      },
    });

    expect(sanitized).toEqual({
      contexts: {
        DrizzleQueryError: { query: SESSION_QUERY, params: REDACTED },
      },
    });
  });

  test("withholds the value of a Better Auth where condition and keeps its field", () => {
    const sanitized = sanitizeForLog({
      where: [
        { field: "token", value: SYNTHETIC_SESSION_TOKEN, operator: "eq" },
        { field: "userId", value: "user_1", connector: "AND" },
      ],
      limit: 1,
    });

    expect(sanitized).toEqual({
      where: [
        { field: "token", value: REDACTED, operator: "eq" },
        { field: "userId", value: REDACTED, connector: "AND" },
      ],
      limit: 1,
    });
  });

  test("keeps a value next to a field that is not a string, which is not a where condition", () => {
    expect(sanitizeForLog({ field: 3, value: "kept" })).toEqual({
      field: 3,
      value: "kept",
    });
  });

  test("redacts credential keys and scrubs strings inside arrays", () => {
    const sanitized = sanitizeForLog([
      { sessionToken: SYNTHETIC_SESSION_TOKEN, postId: 12 },
      `Failed query: ${SESSION_QUERY}\nparams: ${SYNTHETIC_SESSION_TOKEN}`,
    ]);

    expect(sanitized).toEqual([
      { sessionToken: REDACTED, postId: 12 },
      `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`,
    ]);
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a boolean", false],
  ])("returns %s as it is", (_label, value) => {
    expect(sanitizeForLog(value)).toBe(value);
  });

  test("keeps a date as a date", () => {
    const at = new Date("2026-10-02T21:40:00.000Z");

    expect(sanitizeForLog({ at })).toEqual({ at });
  });

  test("summarizes an error with no stack, no code and no cause", () => {
    const bare = new Error("plain");
    bare.stack = undefined;

    expect(sanitizeForLog(bare)).toEqual({ name: "Error", message: "plain" });
  });

  test("marks a cycle instead of recursing forever", () => {
    const parent: Record<string, unknown> = { name: "parent" };
    parent.self = parent;
    const error = new Error("loops");
    error.cause = error;

    expect(sanitizeForLog(parent)).toEqual({
      name: "parent",
      self: "[Circular]",
    });
    expect(sanitizeForLog(error)).toMatchObject({ cause: "[Circular]" });
  });

  test("repeats a shared reference that is not a cycle", () => {
    const shared = { id: 1 };

    expect(sanitizeForLog({ first: shared, second: shared })).toEqual({
      first: { id: 1 },
      second: { id: 1 },
    });
  });

  test("withholds a field whose getter throws and keeps its siblings", () => {
    const record = { postId: 7 };
    Object.defineProperty(record, "broken", {
      enumerable: true,
      get() {
        throw new Error(SYNTHETIC_SESSION_TOKEN);
      },
    });

    expect(sanitizeForLog(record)).toEqual({
      postId: 7,
      broken: `${REDACTED} (unreadable: Error)`,
    });
  });

  test("names the type of a thrown value that is not an error, never the value", () => {
    const record = {};
    Object.defineProperty(record, "broken", {
      enumerable: true,
      get() {
        // The point of the case: a getter is free to throw anything.
        // oxlint-disable-next-line typescript/only-throw-error -- a non-Error throw is the case under test
        throw SYNTHETIC_SESSION_TOKEN;
      },
    });

    expect(sanitizeForLog(record)).toEqual({
      broken: `${REDACTED} (unreadable: string)`,
    });
  });

  test("withholds an object that cannot even list its keys", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error(SYNTHETIC_SESSION_TOKEN);
        },
      }
    );

    expect(sanitizeForLog({ hostile })).toEqual({
      hostile: `${REDACTED} (unreadable: Error)`,
    });
  });

  test("never mutates its input", () => {
    const error = makeSessionQueryError();
    const input = { error, params: [SYNTHETIC_SESSION_TOKEN] };

    sanitizeForLog(input);

    expect(input.params).toEqual([SYNTHETIC_SESSION_TOKEN]);
    expect(error.message).toContain(SYNTHETIC_SESSION_TOKEN);
  });
});

describe("sanitizeRecordInPlace", () => {
  test("rewrites the record it is given, keeping every key", () => {
    const event: Record<string, unknown> = {
      requestId: "req-1",
      error: makeSessionQueryError(),
      user: { id: "u1", token: SYNTHETIC_SESSION_TOKEN },
    };

    sanitizeRecordInPlace(event);

    expect(serialized(event)).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(event).toMatchObject({
      requestId: "req-1",
      error: { message: `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}` },
      user: { id: "u1", token: REDACTED },
    });
  });
});
