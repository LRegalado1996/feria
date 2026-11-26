import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCountView } from "./use-count-view";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// When and how often it sends is `use-count-once.test.tsx`'s: here it hands
// over the key and the send it was given.
const { countOnce } = vi.hoisted(() => ({
  countOnce: vi.fn<(key: string, send: () => Promise<unknown>) => void>(),
}));

vi.mock("./use-count-once", () => ({ useCountOnce: countOnce }));

function setup({ answer = "ok" }: { answer?: "fail" | "ok" } = {}) {
  const count = vi.fn((_input: unknown) => null);
  server.use(
    answer === "fail"
      ? createOrpcErrorHandler("metrics.countView", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("metrics.countView", count)
  );
  const wrapper = createQueryWrapper();
  renderHook(
    () => {
      useCountView(58);
    },
    { wrapper }
  );

  return {
    count,
    key: () => countOnce.mock.calls[0]?.[0],
    mutations: () => wrapper.queryClient.getMutationCache().getAll(),
    send: async () => await countOnce.mock.calls[0]?.[1](),
  };
}

describe("useCountView", () => {
  test("counts the article once per session under a key of its own", () => {
    const { key } = setup();

    expect(key()).toBe("lr-viewed:58");
  });

  test("sends the article's id, settling once the server answers", async () => {
    const { count, send } = setup();

    await expect(send()).resolves.toBeUndefined();
    expect(count).toHaveBeenCalledExactlyOnceWith({ productId: 58 });
  });

  test("fails the send so nothing is marked, without the global report: a blocker is not a bug", async () => {
    const { mutations, send } = setup({ answer: "fail" });

    await expect(send()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
    expect(mutations().map((mutation) => mutation.meta)).toEqual([
      { suppressGlobalErrorReport: true },
    ]);
  });
});
