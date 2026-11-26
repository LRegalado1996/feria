import { describe, expect, test } from "vitest";

import { DICTIONARIES } from "@/test/i18n";

import {
  changePasswordSchema,
  createAccountSchema,
  createChangePasswordFormSchema,
  createLoginFormSchema,
  createResetPasswordFormSchema,
  loginRefSchema,
  resetLoginPasswordSchema,
  USER_ROLES,
} from ".";

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    email: "owner@example.com",
    name: "Store Owner",
    password: "12345678",
    ...overrides,
  };
}

describe("USER_ROLES", () => {
  test("are the two values the database holds: the superadmin, whom no other login may change (FER-015), and every other login", () => {
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

/** The first message the schema gives for `values`, by field. */
function firstIssue(
  schema: {
    safeParse: (value: unknown) => {
      error?: { issues: { message: string; path: PropertyKey[] }[] };
    };
  },
  values: unknown
) {
  const issue = schema.safeParse(values).error?.issues[0];

  return issue ? { message: issue.message, path: issue.path } : null;
}

describe("loginRefSchema and resetLoginPasswordSchema", () => {
  test.each([
    ["a trimmed id", { id: " admin-b " }, { id: "admin-b" }],
    ["an id of 64 characters", { id: "x".repeat(64) }, { id: "x".repeat(64) }],
  ])("accept %s", (_case, input, expected) => {
    expect(loginRefSchema.parse(input)).toEqual(expected);
  });

  test.each([
    ["a blank id", { id: "   " }],
    ["an id of 65 characters", { id: "x".repeat(65) }],
  ])("refuse %s", (_case, input) => {
    expect(loginRefSchema.safeParse(input).success).toBe(false);
  });

  test.each([
    ["1234567", false],
    ["12345678", true],
    ["x".repeat(128), true],
    ["x".repeat(129), false],
  ])("a temporary password of %j is accepted: %s", (password, accepted) => {
    expect(
      resetLoginPasswordSchema.safeParse({ id: "admin-b", password }).success
    ).toBe(accepted);
  });
});

describe("changePasswordSchema", () => {
  test("accepts a new password that differs from the current one", () => {
    expect(
      changePasswordSchema.parse({
        currentPassword: "temporary-123",
        newPassword: "my-own-password",
      })
    ).toEqual({
      currentPassword: "temporary-123",
      newPassword: "my-own-password",
    });
  });

  test.each([
    [
      "the same password",
      { currentPassword: "temporary-123", newPassword: "temporary-123" },
      {
        message: "The new password must differ from the current one",
        path: ["newPassword"],
      },
    ],
    [
      "an empty current password",
      { currentPassword: "", newPassword: "my-own-password" },
      {
        message: "Too small: expected string to have >=1 characters",
        path: ["currentPassword"],
      },
    ],
  ])("refuses %s", (_case, values, issue) => {
    expect(firstIssue(changePasswordSchema, values)).toEqual(issue);
  });
});

describe("the forms' schemas", () => {
  const users = DICTIONARIES.es.admin.users.validation;
  const password = DICTIONARIES.es.admin.password.validation;

  test.each([
    [
      { email: "ana@", name: "Ana", password: "12345678" },
      { message: users.emailInvalid, path: ["email"] },
    ],
    [
      { email: "ana@example.test", name: "  ", password: "12345678" },
      { message: users.nameRequired, path: ["name"] },
    ],
    [
      {
        email: "ana@example.test",
        name: "x".repeat(121),
        password: "12345678",
      },
      { message: users.nameTooLong, path: ["name"] },
    ],
    [
      { email: "ana@example.test", name: "Ana", password: "1234567" },
      { message: users.passwordTooShort, path: ["password"] },
    ],
    [
      { email: "ana@example.test", name: "Ana", password: "x".repeat(129) },
      { message: users.passwordTooLong, path: ["password"] },
    ],
  ])("the new login's form says %j in the page's words", (values, issue) => {
    expect(firstIssue(createLoginFormSchema(users), values)).toEqual(issue);
  });

  test("the new login's form takes the bounds themselves", () => {
    expect(
      createLoginFormSchema(users).parse({
        email: " ana@example.test ",
        name: "x".repeat(120),
        password: "x".repeat(128),
      })
    ).toEqual({
      email: "ana@example.test",
      name: "x".repeat(120),
      password: "x".repeat(128),
    });
  });

  test.each([
    ["1234567", users.passwordTooShort],
    ["x".repeat(129), users.passwordTooLong],
    ["12345678", null],
  ])("the reset form, given %j, says %j", (value, message) => {
    expect(
      firstIssue(createResetPasswordFormSchema(users), { password: value })
    ).toEqual(message === null ? null : { message, path: ["password"] });
  });

  test.each([
    [
      {
        confirmPassword: "new-password-1",
        currentPassword: "",
        newPassword: "new-password-1",
      },
      { message: password.currentRequired, path: ["currentPassword"] },
    ],
    [
      {
        confirmPassword: "1234567",
        currentPassword: "old-password",
        newPassword: "1234567",
      },
      { message: password.passwordTooShort, path: ["newPassword"] },
    ],
    [
      {
        confirmPassword: "old-password",
        currentPassword: "old-password",
        newPassword: "old-password",
      },
      { message: password.sameAsCurrent, path: ["newPassword"] },
    ],
    [
      {
        confirmPassword: "new-password-2",
        currentPassword: "old-password",
        newPassword: "new-password-1",
      },
      { message: password.mismatch, path: ["confirmPassword"] },
    ],
    [
      {
        confirmPassword: "new-password-1",
        currentPassword: "old-password",
        newPassword: "new-password-1",
      },
      null,
    ],
  ])("the change-password form, given %j, says %j", (values, issue) => {
    expect(
      firstIssue(createChangePasswordFormSchema(password), values)
    ).toEqual(issue);
  });
});
