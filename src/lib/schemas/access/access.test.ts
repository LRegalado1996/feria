import { describe, expect, test } from "vitest";

import { createAccountSchema, storeScopeSchema, USER_ROLES } from ".";

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    email: "owner@example.com",
    name: "Store Owner",
    password: "12345678",
    role: "member",
    ...overrides,
  };
}

describe("USER_ROLES", () => {
  test("are a superadmin and a member, nothing else", () => {
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

  test.each([
    ["password", "1234567", false],
    ["password", "12345678", true],
    ["password", "x".repeat(128), true],
    ["password", "x".repeat(129), false],
    ["name", "   ", false],
    ["name", "x".repeat(120), true],
    ["name", "x".repeat(121), false],
    ["email", "owner@", false],
    ["role", "owner", false],
    ["role", "superadmin", true],
  ])("a %s of %j is accepted: %s", (field, value, accepted) => {
    expect(
      createAccountSchema.safeParse(makeAccount({ [field]: value })).success
    ).toBe(accepted);
  });
});

describe("storeScopeSchema", () => {
  test.each([
    ["lr-market", true],
    ["LR Market", false],
    ["admin", false],
    ["", false],
  ])("a store slug of %j is accepted: %s", (storeSlug, accepted) => {
    expect(storeScopeSchema.safeParse({ storeSlug }).success).toBe(accepted);
  });
});
