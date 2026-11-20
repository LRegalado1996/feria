import { describe, expect, test } from "vitest";

import { createAccountSchema, USER_ROLES } from ".";

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    email: "owner@example.com",
    name: "Store Owner",
    password: "12345678",
    ...overrides,
  };
}

describe("USER_ROLES", () => {
  test("are the two values the database's type still holds, until it becomes `admin` alone (FER-041)", () => {
    expect(USER_ROLES).toEqual(["superadmin", "member"]);
  });
});

describe("createAccountSchema", () => {
  test("trims and lowercases the email and trims the name", () => {
    expect(
      createAccountSchema.parse(
        makeAccount({ email: "  Owner@Example.COM ", name: "  Ana  " })
      )
    ).toEqual(makeAccount({ name: "Ana" }));
  });

  test("takes no role: every login is an admin, so a role sent is dropped", () => {
    expect(
      createAccountSchema.parse(makeAccount({ role: "superadmin" }))
    ).toEqual(makeAccount());
  });

  test.each([
    ["password", "1234567", false],
    ["password", "12345678", true],
    ["password", "x".repeat(128), true],
    ["password", "x".repeat(129), false],
    ["name", "   ", false],
    ["name", "x".repeat(120), true],
    ["name", "x".repeat(121), false],
    ["email", "owner@", false],
  ])("a %s of %j is accepted: %s", (field, value, accepted) => {
    expect(
      createAccountSchema.safeParse(makeAccount({ [field]: value })).success
    ).toBe(accepted);
  });
});
