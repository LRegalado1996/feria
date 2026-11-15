import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { isUniqueViolation, translatePostgresError } from "./postgres";

/** What node-postgres throws, as Drizzle wraps it. */
function violation(code: string, constraint?: string): DrizzleQueryError {
  const pgError = Object.assign(new Error("violates constraint"), {
    code,
    constraint,
  });
  return new DrizzleQueryError("insert into post", ["x"], pgError);
}

const scope = { procedure: "post.create", requestId: "req-1" };

describe("translatePostgresError", () => {
  test.each([
    [
      "23505",
      "CONFLICT",
      "A record with these values already exists.",
      "Use a different value for the field that must be unique.",
    ],
    [
      "23001",
      "CONFLICT",
      "It cannot be deleted while other records use it.",
      "Remove or reassign the records that use it, then try again.",
    ],
    [
      "23503",
      "BAD_REQUEST",
      "It refers to a record that no longer exists.",
      "Refresh the page and pick a record that exists.",
    ],
    [
      "23514",
      "BAD_REQUEST",
      "The data breaks one of the rules for this record.",
      "Check the values you entered.",
    ],
    [
      "23502",
      "BAD_REQUEST",
      "A required field is missing.",
      "Fill in every required field.",
    ],
    [
      "22003",
      "BAD_REQUEST",
      "A number is larger than the field allows.",
      "Check the amounts and quantities you entered.",
    ],
  ])("translates SQLSTATE %s to %s", (sqlstate, code, message, fix) => {
    const translated = translatePostgresError(violation(sqlstate), scope);

    expect(translated?.error.code).toBe(code);
    expect(translated?.error.message).toBe(message);
    expect(translated?.error.data).toEqual({
      fix,
      procedure: "post.create",
      requestId: "req-1",
    });
  });

  test("names the violated constraint for the log", () => {
    const translated = translatePostgresError(
      violation("23505", "post_slug_unique"),
      scope
    );

    expect(translated?.constraint).toBe("post_slug_unique");
  });

  test("never forwards the driver's message or the error as cause", () => {
    const translated = translatePostgresError(violation("23505"), scope);

    expect(translated?.error.message).not.toContain("violates");
    expect(translated?.error.cause).toBeUndefined();
  });

  test.each([
    ["an SQLSTATE the user cannot correct", violation("57P01")],
    [
      "a numeric code that only looks like one",
      Object.assign(new Error("x"), { code: 23_505 }),
    ],
    ["an error with no code", new Error("x")],
  ])("leaves %s to the caller", (_case, error) => {
    expect(translatePostgresError(error, scope)).toBeUndefined();
  });
});

describe("isUniqueViolation", () => {
  test("recognizes the named constraint through Drizzle's wrapper", () => {
    expect(
      isUniqueViolation(
        violation("23505", "store_slug_unique"),
        "store_slug_unique"
      )
    ).toBe(true);
  });

  test.each([
    ["another unique constraint", violation("23505", "user_email_unique")],
    ["a unique violation that names no constraint", violation("23505")],
    [
      "a check violation on a constraint of that name",
      violation("23514", "store_slug_unique"),
    ],
    ["an error with no code", new Error("store_slug_unique")],
    ["something that is not an error", "store_slug_unique"],
  ])("leaves %s alone", (_case, error) => {
    expect(isUniqueViolation(error, "store_slug_unique")).toBe(false);
  });
});
