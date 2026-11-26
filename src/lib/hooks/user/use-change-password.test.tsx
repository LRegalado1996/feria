import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useChangePassword } from "./use-change-password";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { currentPassword: "temporal-123", newPassword: "mi-propia-456" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const change = vi.fn((_input: unknown) => ({
    id: "login-1",
    mustChangePassword: false,
  }));
  server.use(
    fails
      ? createOrpcErrorHandler("admin.changePassword", {
          code: "BAD_REQUEST",
          message: "The current password is not correct",
          status: 400,
        })
      : createOrpcHandler("admin.changePassword", change)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useChangePassword(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { change, metas, result };
}

describe("useChangePassword", () => {
  test("sends the current and the new password", async () => {
    const { change, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: "login-1",
      mustChangePassword: false,
    });

    expect(change).toHaveBeenCalledExactlyOnceWith(INPUT);
  });

  test("rejects a wrong current password with its code and message, the report left to the form", async () => {
    const { metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The current password is not correct",
    });

    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
