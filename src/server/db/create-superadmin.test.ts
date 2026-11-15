import { describe, expect, test, vi } from "vitest";

import { createMockDatabase } from "@/server/test/context";

import { createSuperadmin } from "./create-superadmin";

const { createAccount } = vi.hoisted(() => ({
  createAccount: vi.fn(async (_auth: unknown, values: { email: string }) => ({
    email: values.email,
    id: "admin-1",
    name: "Superadmin",
    role: "superadmin" as const,
  })),
}));

vi.mock("@/server/better-auth/accounts", () => ({ createAccount }));

const ENV = {
  SUPERADMIN_EMAIL: "admin@example.com",
  SUPERADMIN_PASSWORD: "synthetic-pass-123",
};

function setup({ superadminExists = false } = {}) {
  const db = createMockDatabase();
  db.query.user.findFirst.mockResolvedValue(
    superadminExists ? { id: "admin-0" } : undefined
  );
  const auth = { $context: Promise.resolve({}) };

  return {
    auth,
    run: async (env: Record<string, string | undefined> = ENV) =>
      await createSuperadmin({ auth: auth as never, db: db as never, env }),
  };
}

describe("createSuperadmin", () => {
  test("creates a superadmin from the environment's email and password", async () => {
    const { auth, run } = setup();

    await expect(run()).resolves.toMatchObject({ email: "admin@example.com" });
    expect(createAccount).toHaveBeenCalledExactlyOnceWith(auth, {
      email: "admin@example.com",
      name: "Superadmin",
      password: "synthetic-pass-123",
      role: "superadmin",
    });
  });

  test("takes the name from SUPERADMIN_NAME when it is set", async () => {
    const { auth, run } = setup();

    await run({ ...ENV, SUPERADMIN_NAME: "Lucía" });

    expect(createAccount).toHaveBeenCalledExactlyOnceWith(
      auth,
      expect.objectContaining({ name: "Lucía" })
    );
  });

  test("refuses once any superadmin exists, creating nothing", async () => {
    const { run } = setup({ superadminExists: true });

    await expect(run()).rejects.toThrow(
      "A superadmin already exists: this script only creates the first one"
    );
    expect(createAccount).not.toHaveBeenCalled();
  });

  test.each([
    [
      "no email",
      { SUPERADMIN_PASSWORD: ENV.SUPERADMIN_PASSWORD },
      "SUPERADMIN_EMAIL must be an email address",
    ],
    [
      "no password",
      { SUPERADMIN_EMAIL: ENV.SUPERADMIN_EMAIL },
      "SUPERADMIN_PASSWORD is required",
    ],
    [
      "a name over 120 characters",
      { ...ENV, SUPERADMIN_NAME: "x".repeat(121) },
      "SUPERADMIN_NAME must be at most 120 characters",
    ],
    [
      "a password one character short",
      { ...ENV, SUPERADMIN_PASSWORD: "1234567" },
      "SUPERADMIN_PASSWORD must be at least 8 characters",
    ],
  ])(
    "refuses %s with a message that names the rule, never the value",
    async (_case, env, message) => {
      const { run } = setup();

      await expect(run(env)).rejects.toMatchObject({ message });
      expect(createAccount).not.toHaveBeenCalled();
    }
  );
});
