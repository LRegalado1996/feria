import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDisableLogin } from "./use-disable-login";
import { loginsKey } from "./use-logins";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ANSWER = {
  disabledAt: "2026-11-25T12:00:00.000Z",
  id: "login-2",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const call = vi.fn((_input: unknown) => ANSWER);
  server.use(
    fails
      ? createOrpcErrorHandler("user.disable", {
          code: "CONFLICT",
          message: "The last enabled login cannot be disabled",
          status: 409,
        })
      : createOrpcHandler("user.disable", call)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDisableLogin(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { call, invalidateQueries, metas, result };
}

describe("useDisableLogin", () => {
  test("sends the login's id, then reads the list again", async () => {
    const { call, invalidateQueries, result } = setup();

    await expect(
      result.current.mutateAsync({ id: "login-2" })
    ).resolves.toEqual(ANSWER);

    expect(call).toHaveBeenCalledExactlyOnceWith({ id: "login-2" });
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: loginsKey(),
    });
  });

  test("after a refusal, reads the list again too, and leaves the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(
      result.current.mutateAsync({ id: "login-2" })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "The last enabled login cannot be disabled",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: loginsKey(),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
