import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateLogin } from "./use-create-login";
import { loginsKey } from "./use-logins";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  email: "ana@example.com",
  name: "Ana",
  password: "temporal-123",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const create = vi.fn((_input: unknown) => ({
    email: "ana@example.com",
    id: "login-7",
    name: "Ana",
  }));
  server.use(
    fails
      ? createOrpcErrorHandler("user.create", {
          code: "CONFLICT",
          message: "An account with that email already exists",
          status: 409,
        })
      : createOrpcHandler("user.create", create)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreateLogin(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { create, invalidateQueries, metas, result };
}

describe("useCreateLogin", () => {
  test("sends the name, email and temporary password, then reads the list again", async () => {
    const { create, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      email: "ana@example.com",
      id: "login-7",
      name: "Ana",
    });

    expect(create).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: loginsKey(),
    });
  });

  test("rejects a taken email with its code, leaves the list and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "An account with that email already exists",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
