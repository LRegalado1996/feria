import { describe, expect, test, vi } from "vitest";

import { refuseDisabledLogin } from "./disabled-login";

const { isLoginDisabled } = vi.hoisted(() => ({
  isLoginDisabled: vi.fn<(db: unknown, userId: string) => Promise<boolean>>(),
}));

vi.mock("@/server/services/access", () => ({ isLoginDisabled }));

function setup({ disabled }: { disabled: boolean }) {
  const db = { marker: "the app's database" };
  isLoginDisabled.mockResolvedValue(disabled);

  return {
    db,
    open: async () => {
      await refuseDisabledLogin(db as never)({ userId: "user-1" });
    },
  };
}

describe("refuseDisabledLogin", () => {
  test("refuses a session for a disabled login with FORBIDDEN and the code the form reads", async () => {
    const { db, open } = setup({ disabled: true });

    await expect(open()).rejects.toMatchObject({
      body: { code: "LOGIN_DISABLED", message: "This login is disabled" },
      status: "FORBIDDEN",
      statusCode: 403,
    });
    expect(isLoginDisabled).toHaveBeenCalledExactlyOnceWith(db, "user-1");
  });

  test("lets an enabled login's session open", async () => {
    const { db, open } = setup({ disabled: false });

    await expect(open()).resolves.toBeUndefined();
    expect(isLoginDisabled).toHaveBeenCalledExactlyOnceWith(db, "user-1");
  });

  test("lets a failed read fail the sign-in, never open the session", async () => {
    const { open } = setup({ disabled: false });
    isLoginDisabled.mockRejectedValueOnce(new Error("connection refused"));

    await expect(open()).rejects.toThrow("connection refused");
  });
});
