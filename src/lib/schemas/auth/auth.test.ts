import { describe, expect, test } from "vitest";

import { en } from "@/content/en";
import { es } from "@/content/es";

import { createAuthSchema } from ".";

const authSchema = createAuthSchema(en.auth.validation);

const EMAIL_ISSUE = { path: ["email"], message: "Please enter a valid email" };
const PASSWORD_ISSUE = {
  path: ["password"],
  message: "Password must be at least 8 characters",
};

function makeCredentials(overrides: Record<string, unknown> = {}) {
  return { email: "user@example.com", password: "password123", ...overrides };
}

/** What the schema made of `input`: the parsed data, or each issue's path and message. */
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

describe("authSchema without sign-up", () => {
  test("drops a name sent beside the credentials: there is no account to name", () => {
    expect(parse(authSchema, makeCredentials({ name: "Jane Doe" }))).toEqual({
      data: makeCredentials(),
    });
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
  });
});
