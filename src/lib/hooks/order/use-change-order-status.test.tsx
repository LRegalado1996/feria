import { ORPCError } from "@orpc/client";
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import {
  isStatusConflict,
  useChangeOrderStatus,
} from "./use-change-order-status";
import { storeOrderKeys } from "./use-order";
import { orderCountsKey } from "./use-order-counts";
import { ordersKey } from "./use-orders";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const INPUT = { id: 42, status: "packed", storeSlug: "lr-market" } as const;

const FAILURES = {
  conflict: {
    code: "CONFLICT",
    message: "That status change is not allowed",
    status: 409,
  },
  outage: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
    status: 500,
  },
};

function setup({ fails }: { fails?: keyof typeof FAILURES } = {}) {
  const change = vi.fn((_input: unknown) => ({ id: 42, status: "packed" }));
  server.use(
    fails
      ? createOrpcErrorHandler("order.changeStatus", FAILURES[fails])
      : createOrpcHandler("order.changeStatus", change)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useChangeOrderStatus("lr-market"), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);
  const invalidated = () =>
    invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey);

  return { change, invalidated, metas, result };
}

const EVERY_READ = [
  storeOrderKeys("lr-market"),
  ordersKey("lr-market"),
  orderCountsKey("lr-market"),
];

describe("useChangeOrderStatus", () => {
  test("sends the order and its new status, then reads the order, the lists and the counts again", async () => {
    const { change, invalidated, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 42,
      status: "packed",
    });

    expect(change).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidated()).toEqual(EVERY_READ);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("on a move someone else got to first, reads everything again and reports nothing", async () => {
    const { invalidated, metas, result } = setup({ fails: "conflict" });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That status change is not allowed",
    });

    expect(invalidated()).toEqual(EVERY_READ);
    expect(reportError).not.toHaveBeenCalled();
    // Nor does the global sink.
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });

  test("reports any other failure once, under its own action, and reads everything again", async () => {
    const { invalidated, result } = setup({ fails: "outage" });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });

    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Orders.change_status" }
    );
    expect(invalidated()).toEqual(EVERY_READ);
  });
});

describe("isStatusConflict", () => {
  test.each([
    [new ORPCError("CONFLICT", { message: "No" }), true],
    [new ORPCError("NOT_FOUND", { message: "No" }), false],
    [new Error("CONFLICT"), false],
    [{ code: "CONFLICT" }, false],
    [null, false],
  ])("is %j a conflict: %s", (error, expected) => {
    expect(isStatusConflict(error)).toBe(expected);
  });
});
