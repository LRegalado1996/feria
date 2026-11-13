import { describe, expect, test } from "vitest";

import { en } from "@/content/en";
import { es } from "@/content/es";

import { createAuthSchema, createSignUpSchema } from ".";

const authSchema = createAuthSchema(en.auth.validation);
const signUpSchema = createSignUpSchema(en.auth.validation);

const EMAIL_ISSUE = { path: ["email"], message: "Please enter a valid email" };
const PASSWORD_ISSUE = {
  path: ["password"],
  message: "Password must be at least 8 characters",
};
const NAME_ISSUE = {
  path: ["name"],
  message: "Name must be at least 2 characters",
};

function makeCredentials(overrides: Record<string, unknown> = {}) {
  return { email: "user@example.com", password: "password123", ...overrides };
}

/** What the schema made of `input`: the parsed data, or each issue's path and message. */
// `signUpSchema` is `authSchema` refined, so one type covers both.
function parse(schema: typeof authSchema, input: unknown) {
  const result = schema.safeParse(input);

  return result.success
    ? { data: result.data }
    : {
        issues: result.error.issues.map(({ path, message }) => ({
          path,
          message,
        })),
      };
}

describe("authSchema", () => {
  test.each([
    ["sign-in credentials", makeCredentials()],
    ["a name beside them", makeCredentials({ name: "Jane Doe" })],
    [
      "a password of exactly 8 characters",
      makeCredentials({ password: "12345678" }),
    ],
  ])("accepts %s as given", (_case, input) => {
    expect(parse(authSchema, input)).toEqual({ data: input });
  });

  test.each([
    ["an address without @", { email: "not-an-email" }, [EMAIL_ISSUE]],
    ["an address without a domain", { email: "user@" }, [EMAIL_ISSUE]],
    ["an empty address", { email: "" }, [EMAIL_ISSUE]],
    ["a password of 7 characters", { password: "1234567" }, [PASSWORD_ISSUE]],
    ["an empty password", { password: "" }, [PASSWORD_ISSUE]],
  ])("rejects %s", (_case, overrides, issues) => {
    expect(parse(authSchema, makeCredentials(overrides))).toEqual({ issues });
  });
});

describe("signUpSchema", () => {
  test.each([
    ["a full name", "Jane Doe"],
    ["a name of exactly 2 characters", "AB"],
  ])("accepts %s", (_case, name) => {
    const input = makeCredentials({ name });

    expect(parse(signUpSchema, input)).toEqual({ data: input });
  });

  test.each([
    ["no name", {}],
    ["an empty name", { name: "" }],
    ["a name of 1 character", { name: "A" }],
  ])("rejects %s", (_case, overrides) => {
    expect(parse(signUpSchema, makeCredentials(overrides))).toEqual({
      issues: [NAME_ISSUE],
    });
  });

  test.each([
    ["the address", { email: "invalid-email" }, [EMAIL_ISSUE]],
    ["the password", { password: "short" }, [PASSWORD_ISSUE]],
  ])("still checks %s", (_case, overrides, issues) => {
    expect(
      parse(signUpSchema, makeCredentials({ name: "Jane Doe", ...overrides }))
    ).toEqual({ issues });
  });
});

describe("messages", () => {
  test("are in the language the schema was built for", () => {
    const messages = es.auth.validation;

    expect(
      parse(
        createAuthSchema(messages),
        makeCredentials({ email: "not-an-email", password: "short" })
      )
    ).toEqual({
      issues: [
        { path: ["email"], message: "Ingresá un email válido" },
        {
          path: ["password"],
          message: "La contraseña debe tener al menos 8 caracteres",
        },
      ],
    });
    expect(
      parse(createSignUpSchema(messages), makeCredentials({ name: "A" }))
    ).toEqual({
      issues: [
        {
          path: ["name"],
          message: "El nombre debe tener al menos 2 caracteres",
        },
      ],
    });
  });
});
