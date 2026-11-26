import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { loginsKey } from "./use-logins";
import { useResetLoginPassword } from "./use-reset-login-password";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { id: "login-2", password: "otra-temporal-9" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const reset = vi.fn((_input: unknown) => ({
    id: "login-2",
    mustChangePassword: true,
  }));
  server.use(
    fails
      ? createOrpcErrorHandler("user.resetPassword", {
          code: "NOT_FOUND",
          message: "Login not found",
          status: 404,
        })
      : createOrpcHandler("user.resetPassword", reset)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useResetLoginPassword(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, reset, result };
}

describe("useResetLoginPassword", () => {
  test("sends the login and its new temporary password, then reads the list again", async () => {
    const { invalidateQueries, reset, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: "login-2",
      mustChangePassword: true,
    });

    expect(reset).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: loginsKey(),
    });
  });

  test("rejects a refusal with its code, leaves the list and the report to the sheet", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Login not found",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
