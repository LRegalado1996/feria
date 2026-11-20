import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateOrder } from "./use-create-order";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  customerName: "Ana Pérez",
  customerPhone: "099 123 456",
  items: [{ productId: 4, quantity: 2 }],
  locale: "es" as const,
  note: "",
  requestKey: "11111111-1111-4111-8111-111111111111",
};

function setup({ answer = "ok" }: { answer?: "fail" | "ok" } = {}) {
  const create = vi.fn((_input: unknown) => ({ token: "order-token" }));
  server.use(
    answer === "fail"
      ? createOrpcErrorHandler("order.create", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("order.create", create)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useCreateOrder(), { wrapper });

  return {
    create,
    mutations: () => wrapper.queryClient.getMutationCache().getAll(),
    result,
  };
}

describe("useCreateOrder", () => {
  test("places the order with what the checkout sent and answers its token", async () => {
    const { create, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      token: "order-token",
    });
    expect(create).toHaveBeenCalledExactlyOnceWith(INPUT);
  });

  test("leaves reporting a failure to the checkout, so it is said once", async () => {
    const { mutations, result } = setup({ answer: "fail" });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
    expect(mutations().map((mutation) => mutation.meta)).toEqual([
      { suppressGlobalErrorReport: true },
    ]);
  });
});
